/**
 * Filesystem Tools Service
 * Provides MCP-compatible filesystem operations through Electron
 */

interface FileSystemTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (parameters: Record<string, any>) => Promise<any>;
}

export class FilesystemToolsService {
  private tools: Map<string, FileSystemTool> = new Map();

  constructor() {
    this.initializeTools();
  }

  private initializeTools() {
    // List directory contents
    this.tools.set('list_directory', {
      name: 'list_directory',
      description: 'List the contents of a directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory to list'
          }
        },
        required: ['path']
      },
      handler: this.listDirectory.bind(this)
    });

    // Read file contents
    this.tools.set('read_file', {
      name: 'read_file',
      description: 'Read the contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to read'
          }
        },
        required: ['path']
      },
      handler: this.readFile.bind(this)
    });

    // Check if path exists
    this.tools.set('path_exists', {
      name: 'path_exists',
      description: 'Check if a file or directory exists',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to check'
          }
        },
        required: ['path']
      },
      handler: this.pathExists.bind(this)
    });

    // Get file/directory info
    this.tools.set('get_file_info', {
      name: 'get_file_info',
      description: 'Get information about a file or directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to get info for'
          }
        },
        required: ['path']
      },
      handler: this.getFileInfo.bind(this)
    });

    // Execute system command (for rm, mkdir, etc.)
    this.tools.set('execute_command', {
      name: 'execute_command',
      description: 'Execute a system command (use with caution)',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Command to execute'
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments'
          }
        },
        required: ['command']
      },
      handler: this.executeCommand.bind(this)
    });
  }

  private async listDirectory(parameters: { path: string }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const isWin = navigator.platform.toLowerCase().includes('win') || navigator.userAgent.includes('Windows');
        const command = isWin ? 'dir' : 'ls -la';
        const result = await window.pip.system.executeCommand(`${command} "${parameters.path}"`);
        
        return {
          success: true,
          path: parameters.path,
          contents: result.stdout || result.output || 'Directory listing completed',
          error: result.stderr || null
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        path: parameters.path,
        contents: `Demo listing for ${parameters.path}:\n- file1.txt\n- file2.js\n- subfolder/`,
        isEmpty: false
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list directory',
        path: parameters.path
      };
    }
  }

  private async readFile(parameters: { path: string }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const isWin = navigator.platform.toLowerCase().includes('win') || navigator.userAgent.includes('Windows');
        const command = isWin ? 'type' : 'cat';
        const result = await window.pip.system.executeCommand(`${command} "${parameters.path}"`);
        
        return {
          success: true,
          path: parameters.path,
          content: result.stdout || result.output || '',
          error: result.stderr || null
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        path: parameters.path,
        content: `Demo content of ${parameters.path}`,
        size: 1024
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
        path: parameters.path
      };
    }
  }

  private async pathExists(parameters: { path: string }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const isWin = navigator.platform.toLowerCase().includes('win') || navigator.userAgent.includes('Windows');
        const command = isWin
          ? `if exist "${parameters.path}" echo EXISTS`
          : `test -e "${parameters.path}" && echo EXISTS || echo NOT_EXISTS`;
        
        const result = await window.pip.system.executeCommand(command);
        const exists = (result.stdout || result.output || '').includes('EXISTS');
        
        return {
          success: true,
          path: parameters.path,
          exists,
          message: exists ? 'Path exists' : 'Path does not exist'
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        path: parameters.path,
        exists: true,
        message: `Demo: ${parameters.path} exists`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check path',
        path: parameters.path
      };
    }
  }

  private async getFileInfo(parameters: { path: string }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const isWin = navigator.platform.toLowerCase().includes('win') || navigator.userAgent.includes('Windows');
        const command = isWin
          ? `dir "${parameters.path}"`
          : `ls -la "${parameters.path}"`;
        
        const result = await window.pip.system.executeCommand(command);
        
        return {
          success: true,
          path: parameters.path,
          info: result.stdout || result.output || 'File info retrieved',
          error: result.stderr || null
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        path: parameters.path,
        type: 'file',
        size: 1024,
        modified: new Date().toISOString(),
        permissions: 'rw-r--r--'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get file info',
        path: parameters.path
      };
    }
  }

  private async executeCommand(parameters: { command: string; args?: string[] }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const fullCommand = parameters.args 
          ? `${parameters.command} ${parameters.args.join(' ')}`
          : parameters.command;
        
        console.log(`Executing command: ${fullCommand}`);
        const result = await window.pip.system.executeCommand(fullCommand);
        
        return {
          success: true,
          command: fullCommand,
          stdout: result.stdout || result.output || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode || 0
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        command: parameters.command,
        stdout: `Demo execution of: ${parameters.command}`,
        stderr: '',
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Command execution failed',
        command: parameters.command
      };
    }
  }

  /**
   * Get all available filesystem tools
   */
  getAvailableTools(): Array<{
    name: string;
    description: string;
    inputSchema: any;
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  /**
   * Execute a filesystem tool
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Filesystem tool '${toolName}' not found`);
    }

    try {
      console.log(`Executing filesystem tool: ${toolName}`, parameters);
      const result = await tool.handler(parameters);
      console.log(`Filesystem tool result:`, result);
      return result;
    } catch (error) {
      console.error(`Filesystem tool execution failed:`, error);
      throw error;
    }
  }

  /**
   * Check if a tool is available
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }
}

// Singleton instance
let filesystemToolsService: FilesystemToolsService | null = null;

export function getFilesystemToolsService(): FilesystemToolsService {
  if (!filesystemToolsService) {
    filesystemToolsService = new FilesystemToolsService();
  }
  return filesystemToolsService;
}