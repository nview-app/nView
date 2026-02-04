const path = require("path");
const { app } = require("electron");

const LIBRARY_ROOT = () => path.join(app.getPath("userData"), "Library");
const PENDING_CLEANUP_FILE = () => path.join(app.getPath("userData"), "pending_cleanup.json");
const PENDING_FILE_CLEANUP_FILE = () => path.join(app.getPath("userData"), "pending_file_cleanup.json");
const SETTINGS_PLAINTEXT_FILE = () => path.join(app.getPath("userData"), "settings.json");
const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json.enc");
const BOOKMARKS_FILE = () => path.join(app.getPath("userData"), "bookmarks.enc");
const APP_ICON_PATH = path.join(__dirname, "..", "favicon.ico");

module.exports = {
  LIBRARY_ROOT,
  PENDING_CLEANUP_FILE,
  PENDING_FILE_CLEANUP_FILE,
  SETTINGS_FILE,
  SETTINGS_PLAINTEXT_FILE,
  BOOKMARKS_FILE,
  APP_ICON_PATH,
};
