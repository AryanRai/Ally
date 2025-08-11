import { useState } from 'react';
import { Message } from '../types/chat';

export function useCommandExecution() {
  const [runningCommands, setRunningCommands] = useState<Set<string>>(new Set());

  const executeSystemCommand = async (
    commandText: string,
    fromQuickInput: boolean,
    serverStatus: any,
    addMessageToActiveChat: (message: Message) => void,
    setQuickInput: (value: string) => void,
    setInput: (value: string) => void,
    setIsTyping: (typing: boolean) => void
  ) => {
    // Parse command with potential remote execution syntax
    const commandMatch = commandText.match(/^\/(?:run|cmd|exec)(?:@(\w+))?\s+(.+)$/);

    if (!commandMatch) {
      return;
    }

    const [, target, command] = commandMatch;
    const actualCommand = command.trim();

    if (!actualCommand) {
      return;
    }

    // Add user message showing the command
    const displayCommand = target ? `${actualCommand} (on ${target})` : actualCommand;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `🔧 Execute command: \`${displayCommand}\``,
      timestamp: Date.now()
    };

    addMessageToActiveChat(userMessage);

    // Clear input
    if (fromQuickInput) {
      setQuickInput('');
    } else {
      setInput('');
    }

    setIsTyping(true);

    try {
      if (!window.pip?.system) {
        throw new Error('System command execution not available');
      }

      let finalCommand = actualCommand;

      // Handle remote execution
      if (target) {
        if (target === 'droplet' && serverStatus?.ip) {
          // Remote execution on Digital Ocean droplet
          finalCommand = `ssh root@${serverStatus.ip} "${actualCommand.replace(/"/g, '\\"')}"`;
        } else if (target === 'wsl') {
          // Windows Subsystem for Linux
          finalCommand = `wsl ${actualCommand}`;
        } else if (target === 'docker') {
          // Docker container execution
          finalCommand = `docker exec -it $(docker ps -q --filter "status=running" | head -1) ${actualCommand}`;
        } else {
          // Custom target - assume it's a hostname/IP
          finalCommand = `ssh ${target} "${actualCommand.replace(/"/g, '\\"')}"`;
        }
      }

      console.log('Executing command:', finalCommand);
      const result = await window.pip.system.executeCommand(finalCommand);

      let responseContent = '';

      if (result.success) {
        responseContent = `✅ **Command executed successfully**`;
        if (target) {
          responseContent += ` on ${target}`;
        }
        responseContent += `\n\n`;

        if (result.stdout && result.stdout.trim()) {
          responseContent += `**Output:**\n\`\`\`\n${result.stdout.trim()}\n\`\`\`\n\n`;
        }

        if (result.stderr && result.stderr.trim()) {
          responseContent += `**Warnings/Errors:**\n\`\`\`\n${result.stderr.trim()}\n\`\`\``;
        }

        if (!result.stdout?.trim() && !result.stderr?.trim()) {
          responseContent += `Command completed with no output.`;
        }
      } else {
        responseContent = `❌ **Command failed**`;
        if (target) {
          responseContent += ` on ${target}`;
        }
        responseContent += `\n\n`;
        responseContent += `**Error:** ${result.error}\n\n`;

        if (result.stderr && result.stderr.trim()) {
          responseContent += `**Details:**\n\`\`\`\n${result.stderr.trim()}\n\`\`\``;
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now()
      };

      addMessageToActiveChat(assistantMessage);
    } catch (error) {
      console.error('Error executing command:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ **Command execution failed**\n\nError: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: Date.now()
      };

      addMessageToActiveChat(errorMessage);
    } finally {
      setIsTyping(false);
    }
  };

  const runInTerminal = async (command: string, codeId: string, addMessageToActiveChat: (message: Message) => void) => {
    try {
      if (!window.pip?.system) {
        console.error('System command execution not available');
        return;
      }

      // Clean the command - remove common prefixes and trim
      let cleanCommand = command.trim();

      // Remove common command prefixes that might be in code blocks
      cleanCommand = cleanCommand.replace(/^\$\s*/, ''); // Remove $ prefix
      cleanCommand = cleanCommand.replace(/^>\s*/, ''); // Remove > prefix
      cleanCommand = cleanCommand.replace(/^#\s*/, ''); // Remove # prefix (comments)

      // Skip if it's just a comment or empty
      if (!cleanCommand || cleanCommand.startsWith('#')) {
        return;
      }

      setRunningCommands(prev => new Set([...prev, codeId]));

      console.log('Running command in terminal:', cleanCommand);

      // Execute the command
      const result = await window.pip.system.executeCommand(cleanCommand);

      // Create a message showing the result
      let responseContent = `🔧 **Executed:** \`${cleanCommand}\`\n\n`;

      if (result.success) {
        responseContent += `✅ **Success**\n\n`;

        if (result.stdout && result.stdout.trim()) {
          responseContent += `**Output:**\n\`\`\`\n${result.stdout.trim()}\n\`\`\`\n\n`;
        }

        if (result.stderr && result.stderr.trim()) {
          responseContent += `**Warnings:**\n\`\`\`\n${result.stderr.trim()}\n\`\`\``;
        }

        if (!result.stdout?.trim() && !result.stderr?.trim()) {
          responseContent += `Command completed with no output.`;
        }
      } else {
        responseContent += `❌ **Failed**\n\n`;
        responseContent += `**Error:** ${result.error}\n\n`;

        if (result.stderr && result.stderr.trim()) {
          responseContent += `**Details:**\n\`\`\`\n${result.stderr.trim()}\n\`\`\``;
        }
      }

      // Add the result as a new message
      const resultMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now()
      };

      addMessageToActiveChat(resultMessage);

    } catch (error) {
      console.error('Error running command:', error);

      // Add error message
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ **Command execution failed**\n\nError: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: Date.now()
      };

      addMessageToActiveChat(errorMessage);
    } finally {
      // Reset running state after 1 second
      setTimeout(() => {
        setRunningCommands(prev => {
          const newSet = new Set(prev);
          newSet.delete(codeId);
          return newSet;
        });
      }, 1000);
    }
  };

  return {
    runningCommands,
    executeSystemCommand,
    runInTerminal
  };
}