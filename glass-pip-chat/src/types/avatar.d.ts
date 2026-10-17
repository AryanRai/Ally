// JSX support for the <agent-robot-avatar> web component (npm: agent-robot-avatar)
import type { AgentRobotAvatar } from 'agent-robot-avatar';
import type { DetailedHTMLProps, HTMLAttributes, Ref } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'agent-robot-avatar': DetailedHTMLProps<HTMLAttributes<AgentRobotAvatar>, AgentRobotAvatar> & {
        ref?: Ref<AgentRobotAvatar>;
        size?: number | string;
        color?: string;
        'auto-sleep'?: number | string;
        motion?: 'auto' | 'reduce' | 'full';
      };
    }
  }
}
