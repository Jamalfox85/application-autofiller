# Job Application Autofill Chrome Extension

A Vue 3 + TypeScript Chrome extension that autofills job applications and saves common responses.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Icons

You need to create 3 icon sizes in the `icons/` folder:

- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

Use Google Stitch or any design tool to create these.

### 3. Build the Extension

```bash
npm run build
```

This will:

- Build the Vue app
- Copy all necessary files to `dist/`
- Create a production-ready extension

### 4. Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder

## 📁 Project Structure

```
job-autofill-extension/
├── src/
│   ├── main.ts          # Vue app entry
│   ├── App.vue          # Main popup component
│   └── style.css        # Global styles
├── manifest.json        # Extension config
├── popup.html          # Popup HTML entry
├── content.js          # Content script (form detection)
├── content.css         # Content script styles
├── background.js       # Background service worker
├── icons/              # Extension icons (create these!)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── vite.config.ts      # Vite build config
├── package.json        # Dependencies
└── tsconfig.json       # TypeScript config
```

## 🛠️ Development

### Run Dev Server (for testing UI)

```bash
npm run dev
```

Note: This runs Vite dev server for UI development only. To test the actual extension, you need to build and load in Chrome.

### Build for Production

```bash
npm run build
```

### Rebuild After Changes

1. Make your changes
2. Run `npm run build`
3. Go to `chrome://extensions/`
4. Click the refresh icon on your extension

## ✨ Features

### Current Features

- ✅ Save personal info (name, email, phone, etc.)
- ✅ Autofill job application forms
- ✅ Save and reuse common responses
- ✅ Tag responses for easy organization
- ✅ Copy responses to clipboard
- ✅ Visual indicator on job sites

### Planned Features (Day 2-6)

- 🔜 AI-powered response matching
- 🔜 Resume/cover letter generation
- 🔜 Application tracking
- 🔜 Analytics dashboard

## 📝 Usage

1. Click the extension icon
2. Fill in your personal info
3. Navigate to a job application
4. Click "Autofill Current Page"
5. Save common responses for reuse

## 🐛 Troubleshooting

**Extension not showing up:**

- Make sure you loaded the `dist/` folder, not the root folder
- Check that all icon files exist

**Autofill not working:**

- Refresh the page after loading the extension
- Check browser console for errors
- Some sites use custom form frameworks that may need special handling

**Build errors:**

- Delete `node_modules` and run `npm install` again
- Make sure you're using Node 16+

## 📦 Publishing to Chrome Web Store

1. Create a developer account ($5 one-time fee)
2. Zip the `dist/` folder
3. Upload to Chrome Web Store Developer Dashboard
4. Fill in store listing details
5. Submit for review (3-7 days)
