# nView User Guide

## 1. How nView works

nView is a local desktop workflow with four connected parts:

- **Gallery / Index**: your encrypted local library and the main control surface.
- **Reader**: where you read manga from your local library.
- **Browser**: an embedded web viewer used to navigate supported source pages and queue downloads.
- **Downloader**: shows queued download jobs, progress, completion, and failures.

Content enters your library in two ways:

1. **Browser → Direct Download → Downloader → Gallery**
2. **Import manga → Gallery**

From there, you can organize (groups/tags), edit metadata, read, and export selected entries.

---

## 2. First launch

When you open nView for the first time:

1. Create your vault passphrase in the unlock/setup screen.
2. Open **Settings** and configure your source URLs.
3. Save settings.
4. Start using **Open Web Viewer** (Browser) or **Import manga** to populate your library.

After setup, the **Gallery / Index** window becomes your home screen.

---

## Gallery / Index

The Gallery (main window) is where your collection is displayed and managed.

### What you do here

- Browse manga cards in your local library.
- Search by title/artist/tags.
- Filter by tags and language.
- Sort by favorites, recency, title, artist, page count, and published date.
- Open manga in the Reader.
- Open Browser, Downloader, Group Manager, Tag Manager, Import, and Export tools.

### Settings

Use the **Settings** menu in Gallery to configure general behavior:

- Source URLs used by the Browser/adapters.
- Default sort.
- Manga card size.
- Dark mode.
- Block pop-up windows.
- Adapter allow-list controls.

### Move library

From **Settings menu → Move library directory**, you can migrate your library path:

- See the current library path.
- Select a new destination folder.
- Run pre-move checks.
- Confirm migration once validation passes.

---

## Reader

Open Reader by selecting a manga from Gallery.

### Core reading tools

- Page list with jump-to-page selector.
- Reader width slider.
- Favorite toggle.
- Read list/session switcher.

### Reader hotkeys

- `Space`: jump to the next page.
- `F`: toggle reader width between fit/zoom extremes.
- `H`: hide/show the reader top bar.

### Edit metadata

Reader includes an **Edit → Edit metadata** flow for updating fields such as:

- Source URL (view only)
- Publishing date
- Note
- Title
- Artist
- Languages
- Tag-style metadata (for example parodies/characters/tags)

### Edit pages

Reader includes an **Edit → Edit pages** flow for page-level adjustments, including page ordering and page metadata edits.

---

## Browser

The Browser is an in-app web viewer for supported sites.

### Main controls

- Back / Forward
- URL field + refresh
- Bookmark panel (search + saved entries)
- Add bookmark
- **Direct Download** action when a supported page is detected

Use Browser to navigate source pages and queue downloads, then monitor progress in Downloader.

---

## Downloader

Downloader tracks jobs started from Browser direct downloads.

### What you see

- Active and completed jobs
- Per-job progress and status
- Error information when a job fails
- File details modal for a selected job
- **Clear all** for completed items

---

## Group Manager

Group Manager is a guided workflow for curated collections.

### Step flow

1. **Select group**
   - Search groups
   - Create new group
   - Edit group name/description
   - Delete group
2. **Add/remove manga**
   - Search library items
   - Select all / deselect all
   - Save membership changes

Use groups to build reusable reading sets or thematic collections.

---

## Tag Manager

Tag Manager centralizes tag taxonomy and alias maintenance.

### Main capabilities

- Search tags/metadata terms.
- Filter inventory views (for example: hidden-only filters).
- Create alias groups.
- Edit alias groups (name/members).
- Delete alias groups.

Use this window to keep tag data clean and consistent across your library.

---

## Import manga

Import manga is a guided multi-step flow for bringing local folders into nView.

### Step flow

1. **Folder selection**
   - Choose root-mode (many manga) or single-folder mode
   - Review scan summary
2. **Metadata template**
   - Apply default artist/language/tags to candidates missing metadata
3. **Preview & customizing**
   - Inspect candidate eligibility and warnings
   - Edit title/artist/language/tags before import
4. **Import & reporting**
   - Run import
   - Review imported / skipped / failed results

---

## Export manga

Export manga is a guided flow for producing a portable export from selected library entries.

### Step flow

1. **Select manga**
   - Search, select all/deselect all, and review a preview/details panel
2. **Select export folder & check**
   - Choose destination
   - Validate permissions, emptiness, and available space
3. **Export & reporting**
   - Run export
   - Track progress and review exported / skipped / failed counts
