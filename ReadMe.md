## vt.js

A reusable VT Emulator written in NodeJS.

`vt.js` can be useful for:
- Writing a terminal emulator
- Writing a terminal multiplexer

`vt.js` was largely inspired by existing VT emulation projects including:
- Google's `hterm`: http://goo.gl/3i5AJ 
- @chjj's `tty.js`: http://github.com/chjj/tty.js/
- Suckless' `st`: http://st.suckless.org/

### Example Usage

```
var pty = require('pty.js');

var pty = require('pty.js').spawn('bash', [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env
});

var term = require('vt.js').term({ 
  pty: pty,
  cols: 80,
  rows: 30
});

term.on('refresh', function(dirty, slice, cursor) {
  /* ... */
});
term.on('alternate', function(is_alt) {
  /* ... */
});
term.on('title', function(title) {
  /* ... */
});
term.on('resize', function(cols, rows) {
  /* ... */
});

/* var buffer = term.buffer(); */
/* var title = term.title();   */
/* var mode = term.mode();     */
/* var cusror = term.cursor(); */

/* term.resize(120, 40);       */

```

### Architecture

`vt.js` is composed of two main software component:
- `vt`: which is the core part of the VT emulation. It receives the stream of
data coming directy form the pty and translates VT10x character sequences 
into events that it emits. The list of events emitted can be found in the file
`lib/vt.js`.
- `term`: term interprets the events received by `vt` (without knowledge of 
VT10x character sequences) and interprets them to maintain the state of the
current buffer, scrollback buffer and cursor. It itself emits simple events on
`refresh`, `alternate` (mode), `title` change, and `resize`. It can easily be
used for rendering of the screen in any given UI system.

### Todo

- [ ] Extend test suite
- [ ] Handle all `vttest` corner cases
- [ ] Optimize `refresh` semantics 

### License

 Copyright (c) 2013, Stanislas Polu. All rights reserved. MIT License.
 (see LICENSE file)

