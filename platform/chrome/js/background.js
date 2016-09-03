var xBrowserSync = xBrowserSync || {};
xBrowserSync.App = xBrowserSync.App || {};

/* ------------------------------------------------------------------------------------
 * Class name:	xBrowserSync.App.Background
 * Description:	Initialises Chrome background required functionality; registers events; 
 *              listens for sync requests.
 * ------------------------------------------------------------------------------------ */

xBrowserSync.App.Background = function($q, platform, global, utility, bookmarks) {
    'use strict';
	
	var asyncChannel;

/* ------------------------------------------------------------------------------------
 * Constructor
 * ------------------------------------------------------------------------------------ */
 
	var Background = function() {
		chrome.runtime.onInstalled.addListener(install);
		
		chrome.runtime.onStartup.addListener(startup);
		
		chrome.bookmarks.onCreated.addListener(createBookmark);
		
		chrome.bookmarks.onRemoved.addListener(removeBookmark);
		
		chrome.bookmarks.onChanged.addListener(changeBookmark);
		
		chrome.bookmarks.onMoved.addListener(moveBookmark);
		
		chrome.bookmarks.onImportBegan.addListener(handleImport);
		
		chrome.alarms.onAlarm.addListener(handleAlarm);
		
		chrome.runtime.onConnect.addListener(listenForMessages);
	};


/* ------------------------------------------------------------------------------------
 * Private functions
 * ------------------------------------------------------------------------------------ */
	
	var changeBookmark = function(id, changeInfo) {
		// Exit if sync isn't enabled or event listeners disabled
		if (!global.SyncEnabled.Get() || global.DisableEventListeners.Get()) {
            return;
		}
		
		// Sync updates
		bookmarks.Sync({
			type: global.SyncType.Push,
			changeInfo: {
				type: global.UpdateType.Update, 
				data: [id, changeInfo]
			}
		})
			.catch(function(err) {
				// Display alert
				var errMessage = utility.GetErrorMessageFromException(err);
				displayAlert(errMessage.title, errMessage.message);
			});
	};
	
	var createBookmark = function(id, bookmark) {
		// Exit if sync isn't enabled or event listeners disabled
		if (!global.SyncEnabled.Get() || global.DisableEventListeners.Get()) {
            return;
		}
		
		// Sync updates
		bookmarks.Sync({
			type: global.SyncType.Push,
			changeInfo: { 
				type: global.UpdateType.Create, 
				data: [id, bookmark]
			}
		})
			.catch(function(err) {
				// Display alert
				var errMessage = utility.GetErrorMessageFromException(err);
				displayAlert(errMessage.title, errMessage.message);
			});
	};
	
	var displayAlert = function(title, message, callback) {
		var options = {
			type: 'basic',
			title: title,
			message: message,
			iconUrl: 'img/notification-icon.png'
		};
		
		if (!callback) {
			callback = null;
		}
		
		chrome.notifications.create('xBrowserSync-notification', options, callback);
	};
	
	var handleAlarm = function(alarm) {
		// When alarm fires check for sync updates
		if (alarm && alarm.name === global.Alarm.Name.Get()) {
			// Exit if sync isn't enabled or event listeners disabled
			if (!global.SyncEnabled.Get() || global.DisableEventListeners.Get()) {
				return;
			}
			
			bookmarks.CheckForUpdates()
				.catch(function(err) {
					// Display alert
					var errMessage = utility.GetErrorMessageFromException(err);
					displayAlert(errMessage.title, errMessage.message);
				});
		}
	};
	
	var handleImport = function() {
		if (!!global.SyncEnabled.Get()) {
			// Display alert so that user knows to create new sync
			displayAlert(
				platform.Constants.Get(global.Constants.Error_BrowserImportBookmarksNotSupported_Title), 
				platform.Constants.Get(global.Constants.Error_BrowserImportBookmarksNotSupported_Message));
		}
	};
	
	var handleMessage = function(msg) {
		switch (msg.command) {
			// Trigger bookmarks sync
			case global.Commands.SyncBookmarks:
				syncBookmarks(msg, global.Commands.SyncBookmarks);
				break;
			// Trigger bookmarks sync with no callback
			case global.Commands.NoCallback:
				syncBookmarks(msg, global.Commands.NoCallback);
				break;
			// Trigger bookmarks restore
			case global.Commands.RestoreBookmarks:
				restoreBookmarks(msg);
				break;
		}
	};
	
	var install = function() {
		// Clear alarm
		chrome.alarms.clear(global.Alarm.Name.Get(), function() {
			// Create alarm
			chrome.alarms.create(
				global.Alarm.Name.Get(), {
					periodInMinutes: global.Alarm.Period.Get()
				});
		});
	};
	
	var listenForMessages = function(port) {
		if (port.name !== global.Title.Get()) {
			return;
		}
		
		asyncChannel = port;
		
		// Listen for messages to initiate syncing
		asyncChannel.onMessage.addListener(function(msg) {
			handleMessage(msg);
		});
	};
	
	var moveBookmark = function(id, moveInfo) {
		// Exit if sync isn't enabled or event listeners disabled
		if (!global.SyncEnabled.Get() || global.DisableEventListeners.Get()) {
            return;
		}
		
		// Sync updates
		bookmarks.Sync({
			type: global.SyncType.Push,
			changeInfo: { 
				type: global.UpdateType.Move, 
				data: [id, moveInfo]
			}
		})
			.catch(function(err) {
				// Display alert
				var errMessage = utility.GetErrorMessageFromException(err);
				displayAlert(errMessage.title, errMessage.message);
			});
	};
	
	var removeBookmark = function(id, removeInfo) {
		// Exit if sync isn't enabled or event listeners disabled
		if (!global.SyncEnabled.Get() || global.DisableEventListeners.Get()) {
            return;
		}
		
		// Sync updates
		bookmarks.Sync({
			type: global.SyncType.Push,
			changeInfo: {
				type: global.UpdateType.Delete, 
				data: [id, removeInfo]
			}
		})
			.catch(function(err) {
				// Display alert
				var errMessage = utility.GetErrorMessageFromException(err);
				displayAlert(errMessage.title, errMessage.message);
			});
	};
	
	var restoreBookmarks = function(restoreData) {
		// Start restore
		bookmarks.Sync(restoreData)
			.then(function() {
				try {
					asyncChannel.postMessage({ command: global.Commands.RestoreBookmarks, success: true });
				}
				catch (ex) {}
			})
			.catch(function(err) {
				try {
					asyncChannel.postMessage({ command: global.Commands.RestoreBookmarks, success: false, error: err });
				}
				catch (ex) {}
			});
	};
	
	var startup = function() {
		// Check if a sync was interrupted
		if (!!global.IsSyncing.Get()) {
			global.IsSyncing.Set(false);
			
			// Disable sync
			global.SyncEnabled.Set(false);
			
			// Display alert
			displayAlert(
				platform.Constants.Get(global.Constants.Error_SyncInterrupted_Title), 
				platform.Constants.Get(global.Constants.Error_SyncInterrupted_Message));
			
			return;
		}
		
		// Exit if sync isn't enabled or event listeners disabled
		if (!global.SyncEnabled.Get() || global.DisableEventListeners.Get()) {
            return;
		}
		
		// Check for updates to synced bookmarks
		bookmarks.CheckForUpdates()
			.catch(function(err) {
				// Display alert
				var errMessage = utility.GetErrorMessageFromException(err);
				displayAlert(errMessage.title, errMessage.message);
			});
	};
	
	var syncBookmarks = function(syncData, command) {
		// Start sync
		bookmarks.Sync(syncData)
			.then(function() {
				try {
					asyncChannel.postMessage({ command: command, success: true });
				}
				catch (ex) {}
			})
			.catch(function(err) {
				try {
					asyncChannel.postMessage({ command: command, success: false, error: err });
				}
				catch (ex) {}
			});
	};
	
	// Call constructor
    return new Background();
};