## vt.js

A reusable VT Emulator written in NodeJS.

`vt.js` can be useful for:
- Writing a terminal emulator
- Writing a terminal multiplexer

`vt.js` was largely inspired by existing VT emulation projects including:
- Google's `hterm`: http://goo.gl/3i5AJ 
- @chjj's `tty.js`: https://github.com/chjj/tty.js/

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

`vt.js` is composed of two main 
