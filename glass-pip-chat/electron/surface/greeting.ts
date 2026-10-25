/** The greeting the pill is showing, shared with the notch so both surfaces greet alike. */
let current = '';
export const setSharedGreeting = (text: string) => { current = text.slice(0, 120); };
export const sharedGreeting = () => current;
