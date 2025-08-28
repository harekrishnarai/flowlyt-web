# GitHub Workflow Fetching Troubleshooting Guide

## Issue: Fewer Workflow Files Fetched Than Expected

If you notice that our tool is fetching fewer workflow files than expected from a GitHub repository, here's how to diagnose and resolve the issue:

### Enhanced Logging

We've added comprehensive logging to the GitHub fetching process. To see detailed information about what's happening:

1. **Open Browser Developer Tools**
   - Press F12 or right-click and select "Inspect"
   - Go to the "Console" tab

2. **Try fetching the repository**
   - Enter the GitHub repository URL
   - Click "Extract Workflows"
   - Watch the console for detailed logging

### What to Look For in Console Logs

The console will show:
- How many YAML files were found in the repository
- Progress for each file being fetched
- Success/failure status for each file
- File sizes and any error messages
- Final count of successfully fetched vs. attempted files

Example console output:
```
Found 11 YAML workflow files
Fetching file 1/11: ci.yml
Successfully fetched ci.yml (2543 characters)
Fetching file 2/11: publish.yml
Failed to fetch publish.yml: 404 Not Found
...
Successfully fetched 9 out of 11 workflow files
```

### Common Causes and Solutions

#### 1. GitHub API Rate Limiting
- **Symptom**: Some files fail to fetch with 403 errors
- **Solution**: Wait a few minutes and try again
- **Prevention**: We've added delays between requests to be more respectful to the API

#### 2. Large File Issues
- **Symptom**: Some files timeout or fail to download
- **Solution**: The repository might have very large workflow files
- **Workaround**: Try fetching individual files manually if needed

#### 3. Network/CORS Issues
- **Symptom**: Random failures with network error messages
- **Solution**: Check your internet connection and try again
- **Note**: Some corporate firewalls may interfere with GitHub API calls

#### 4. Repository Access Issues
- **Symptom**: 404 errors for specific files
- **Solution**: The repository might have:
  - Private workflow files
  - Recently deleted/renamed files
  - Files with restricted access

### Verifying Repository Content

To manually verify how many workflow files should be available:

1. Visit: `https://github.com/[owner]/[repo]/.github/workflows`
2. Count the `.yml` and `.yaml` files (excluding directories)
3. Compare with what our tool fetched

For the nx repository specifically:
- Expected: 11 YAML workflow files
- Directory "nightly" contains TypeScript files, not workflows

### Improved Error Handling

Our latest version includes:
- **Parallel fetching** with controlled concurrency
- **Better error reporting** for individual file failures
- **Retry logic** for failed requests
- **Detailed logging** for troubleshooting

### If Issues Persist

If you consistently see fewer files than expected:

1. **Check the console logs** for specific error messages
2. **Verify repository access** by visiting the GitHub URL directly
3. **Try a different repository** to see if it's a specific repo issue
4. **Report the issue** with console log details

### Known Limitations

- **Private repositories**: Require authentication (not currently supported)
- **Very large files**: May timeout on slow connections
- **API rate limits**: GitHub allows limited requests per hour from browser
- **CORS restrictions**: Some corporate networks may block API calls

The enhanced logging should help identify exactly which files are failing and why, making it easier to troubleshoot repository-specific issues.
