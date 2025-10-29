# Testing DocRAG Extension

## ✅ Steps to Test the Extension

### 1. Reload the Extension
After compiling, in the Extension Development Host window:
- Press **Ctrl+Shift+P** (or **Cmd+Shift+P** on Mac)
- Type: **Developer: Reload Window**
- OR just press **Ctrl+R**

### 2. Verify Commands are Registered
Open Command Palette (**Ctrl+Shift+P**) and type "DocRAG"

You should see:
- ✅ **DocRAG: Index Documentation**
- ✅ **DocRAG: Search Documentation**
- ✅ **DocRAG: Open Settings**
- ✅ **DocRAG: Clear Cache**

### 3. Configure a Test Library
1. Open Settings: **File > Preferences > Settings** (or **Ctrl+,**)
2. Search for: `docrag`
3. Click **Edit in settings.json**
4. Add this configuration:

```json
{
  "docrag.libraries": [
    {
      "name": "MDN Web Docs - JavaScript",
      "url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript"
    }
  ],
  "docrag.chunkSize": 512,
  "docrag.chunkOverlap": 50,
  "docrag.maxSearchResults": 5,
  "docrag.enableCopilotIntegration": true
}
```

### 4. Test Indexing (Small Test)
For a quick test, use a smaller documentation site:

```json
{
  "docrag.libraries": [
    {
      "name": "Vite",
      "url": "https://vitejs.dev/guide/"
    }
  ]
}
```

**Steps:**
1. Run: **DocRAG: Index Documentation**
2. Select: **Vite** (or the library you configured)
3. Watch the progress notification
4. Check the status bar (bottom right) - should show chunk count

### 5. Test Search
1. Run: **DocRAG: Search Documentation**
2. Enter a query like: "configuration" or "plugins"
3. Browse the results
4. Click a result to open the documentation URL

### 6. Check Debug Console
In the main VS Code window (not the Extension Development Host):
- Open: **View > Output**
- Select: **Extension Host** from dropdown
- Look for logs like:
  ```
  DocRAG extension is now active
  Storage path: C:\Users\...\globalStorage\...
  Storage initialized
  Commands registered
  ```

## 🐛 Troubleshooting

### Commands Still Not Found
1. Check the Output panel (Extension Host) for errors
2. Make sure compilation succeeded: `npm run compile`
3. Reload the Extension Development Host window (**Ctrl+R**)

### Indexing Fails
**Common issues:**
- Network connectivity
- Website blocks scrapers (use official API docs)
- Large site takes time (be patient)

**Solutions:**
- Try a smaller documentation site first (like Vite)
- Check console for specific errors
- Some sites work better with sitemap.xml

### Status Bar Not Showing
- Look at bottom-right corner
- Should say: "DocRAG: 0 chunks" initially
- After indexing: "DocRAG: XXX chunks"

### Storage/Database Errors
- Check that the globalStorageUri path exists
- Windows path should be: `C:\Users\[username]\AppData\Roaming\Code\User\globalStorage\docrag.docrag\`
- You can manually delete the DB to reset: `docrag.db`

## 📊 Expected Behavior

### First Run
1. Extension activates (logs show "DocRAG extension is now active")
2. Commands are registered
3. Status bar appears (shows 0 chunks)
4. No errors in console

### After Indexing (e.g., Vite docs)
- **Discovery:** ~10-30 seconds (depends on sitemap)
- **Scraping:** ~1-2 seconds per page
- **Chunking:** Fast (< 1 second)
- **Embeddings:** ~50ms per chunk (first run downloads model ~90MB)
- **Total time:** ~2-5 minutes for Vite docs

### Storage Size
- Vite docs: ~50 pages → ~200-300 chunks → ~1-2 MB database
- React docs: ~200 pages → ~1000-1500 chunks → ~5-10 MB database

## 🎯 Quick Test Commands

### Test 1: Verify Extension Loads
```
1. Press F5 to start debugger
2. In Extension Host, press Ctrl+Shift+P
3. Type: "DocRAG"
4. ✅ Should see 4 commands
```

### Test 2: Open Settings
```
1. Run: DocRAG: Open Settings
2. ✅ Should open VS Code settings filtered to "docrag"
```

### Test 3: Test Without Indexing
```
1. Run: DocRAG: Search Documentation
2. Enter any query
3. ✅ Should show "No results found" (nothing indexed yet)
```

### Test 4: Small Index Test
```
1. Configure: Vite docs
2. Run: DocRAG: Index Documentation
3. Select: Vite
4. ✅ Watch progress notification
5. ✅ Status bar updates with chunk count
```

### Test 5: Search Indexed Content
```
1. After indexing Vite
2. Run: DocRAG: Search Documentation
3. Query: "vite config"
4. ✅ Should show relevant results
5. ✅ Click result opens documentation
```

## 📝 Console Logs to Look For

### Successful Activation:
```
DocRAG extension is now active
Storage path: C:\Users\...\globalStorage\docrag.docrag
Storage initialized
Embeddings engine created
Search engine created
Copilot integration created
Copilot integration registered
Status bar created
DocRAG extension initialized successfully
```

### During Indexing:
```
Discovered 45 pages for Vite
Scraped 42 pages for Vite
Created 315 chunks for Vite
Loading embedding model: Xenova/all-MiniLM-L6-v2
Embedding model loaded successfully
Embedded 100/315 texts
Embedded 200/315 texts
Embedded 315/315 texts
Built search index with 315 chunks
```

## 🎉 Success Criteria

✅ **Extension loads without errors**  
✅ **All 4 commands appear in Command Palette**  
✅ **Settings can be configured**  
✅ **Indexing completes successfully**  
✅ **Status bar shows chunk count**  
✅ **Search returns relevant results**  
✅ **Clicking results opens documentation**  

---

## 🚀 Next Steps After Testing

Once basic functionality works:
1. **Index real documentation** (React, FastAPI, your favorite library)
2. **Test with GitHub Copilot** (if you have Copilot enabled)
3. **Report any issues** you find
4. **Suggest improvements** for future versions

Good luck testing! 🎊
