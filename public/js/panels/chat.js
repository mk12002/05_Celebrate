import { h } from '../dom.js';
import { byId } from './shared.js';

/**
 * Appends a chat bubble to the conversation log and keeps it scrolled to the latest message.
 * @param {{role: 'user' | 'assistant', text: string, changes?: string[]}} message
 */
export function appendChatMessage({ role, text, changes = [] }) {
  const log = byId('chat-log');
  log.append(
    h(
      'div',
      { className: `msg msg-${role}` },
      h('p', { className: 'msg-author' }, role === 'user' ? 'You' : 'Celebrate'),
      h('p', null, text),
      changes.length
        ? h(
            'ul',
            { className: 'msg-changes', 'aria-label': 'Changes applied' },
            changes.map((c) => h('li', null, c)),
          )
        : null,
    ),
  );
  log.scrollTop = log.scrollHeight;
}
