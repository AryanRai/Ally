# Filesystem Tools Integration Example

## Multi-Step Folder Removal Example

When you ask: **"How do I remove this folder '/path/to/folder'?"**

The AI will automatically execute multiple tools in sequence:

### Step 1: Check if folder exists
```
Tool: path_exists
Parameters: { path: "/path/to/folder" }
Result: { exists: true, path: "/path/to/folder" }
```

### Step 2: List folder contents
```
Tool: list_directory  
Parameters: { path: "/path/to/folder" }
Result: { 
  contents: "file1.txt\nfile2.js\nsubfolder/",
  isEmpty: false 
}
```

### Step 3: AI analyzes and suggests command
Based on the results, the AI will determine:
- Folder exists ✓
- Folder is not empty ✗
- Need to use `rm -rf` for non-empty folder

### Step 4: Execute removal command
```
Tool: execute_command
Parameters: { 
  command: "rm", 
  args: ["-rf", "/path/to/folder"] 
}
Result: { 
  success: true,
  stdout: "",
  stderr: "",
  exitCode: 0
}
```

## Available Filesystem Tools

### 1. `path_exists`
Check if a file or directory exists
```json
{
  "name": "path_exists",
  "parameters": { "path": "/some/path" }
}
```

### 2. `list_directory`
List contents of a directory
```json
{
  "name": "list_directory", 
  "parameters": { "path": "/some/directory" }
}
```

### 3. `read_file`
Read contents of a file
```json
{
  "name": "read_file",
  "parameters": { "path": "/some/file.txt" }
}
```

### 4. `get_file_info`
Get detailed information about a file or directory
```json
{
  "name": "get_file_info",
  "parameters": { "path": "/some/path" }
}
```

### 5. `execute_command`
Execute system commands
```json
{
  "name": "execute_command",
  "parameters": { 
    "command": "rm",
    "args": ["-rf", "/path/to/remove"]
  }
}
```

## Example Conversations

### Example 1: Check if file exists
**User**: "Does the file 'config.json' exist?"

**AI Response**: "I'll check if the file exists."
- Tool: `path_exists` with `{ path: "config.json" }`
- Result: File existence status

### Example 2: Read file contents  
**User**: "What's in the README.md file?"

**AI Response**: "I'll read the README.md file for you."
- Tool: `read_file` with `{ path: "README.md" }`
- Result: File contents displayed

### Example 3: List directory
**User**: "What files are in the src folder?"

**AI Response**: "I'll list the contents of the src folder."
- Tool: `list_directory` with `{ path: "src" }`
- Result: Directory listing

### Example 4: Complex folder removal
**User**: "Remove the 'temp' folder"

**AI Response**: "I'll check the temp folder and remove it safely."
1. Tool: `path_exists` with `{ path: "temp" }`
2. Tool: `list_directory` with `{ path: "temp" }`
3. Tool: `execute_command` with appropriate rm command based on contents

## Tool Detection Patterns

The AI automatically detects when to use filesystem tools based on these patterns:

### Existence Checks
- "check if [path] exists"
- "does [file] exist"
- "is there a [folder]"

### Directory Listings
- "list files in [directory]"
- "what's in [folder]"
- "show contents of [path]"

### File Reading
- "read [file]"
- "what's in [file]"
- "show me [file] contents"

### File Operations
- "remove [path]"
- "delete [folder]"
- "rm [file]"

## Integration with Chat

The filesystem tools are automatically available in your chat interface. Simply ask natural language questions about files and folders, and the AI will:

1. **Detect** the appropriate tools to use
2. **Execute** them in the correct sequence
3. **Analyze** the results
4. **Provide** helpful responses and suggestions

## Safety Features

- **Path validation**: Prevents access to system-critical paths
- **Command validation**: Validates commands before execution
- **Error handling**: Graceful handling of file system errors
- **User confirmation**: For destructive operations (when configured)

## Platform Support

- **Windows**: Uses `dir`, `del`, `rmdir` commands
- **macOS/Linux**: Uses `ls`, `rm`, `mkdir` commands
- **Cross-platform**: Automatically detects and uses appropriate commands