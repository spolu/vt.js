/*
 * vt.js: term.js
 *
 * Copyright (c) 2013, Stanislas Polu. All rights reserved.
 * (see LICENSE file)
 *
 * @log
 * - 20130517 @spolu    Expose the cursor
 * - 20130514 @spolu    Fixes to properly run vim
 * - 20130510 @spolu    Fixes first time running vim
 * - 20130502 @spolu    Fixed dirty computation (esp. in case of resizing)
 * - 20130430 @spolu    Added cols / rows to term spec
 * - 20130429 @spolu    First implementation done. 
 *                      Color optimization & `my.scroll`
 * - 20130415 @spolu    Comments and basic architecture
 */
'use strict';

var common = require('./common.js');
var events = require('events');
var util = require('util');
var factory = common.factory;

//
// ## CHAR_ATTRS
// Bitwise values for character attribute. Each glyph in the term is a couple
// `[attr, c]` with c being a utf8 character and attr a 32 bit integer with:
// Next 9 bits: Backround Color (0-511)
// Next 9 bits: Foreground Color (0-511)
// Next 14 bits: Mask of CHAR_ATTRS bitwise encoded
//
var CHAR_ATTRS = {
  NULL: 0,
  REVERSE: 1,
  UNDERLINE: 2,
  BOLD: 4,
  GFX: 8,
  ITALIC: 16,
  BLINK: 32
};

var CURSOR_STATE = { 
  DEFAULT: 0,
  WRAPNEXT: 1,
  ORIGIN: 2
};
    
var TERM_MODE = {
  WRAP: 1,
  INSERT: 2,
  APPKEYPAD: 4,
  ALTSCREEN: 8,
  CRLF: 16,
  MOUSEBTN: 32,
  MOUSEMOTION: 64,
  MOUSE: 32|64,
  REVERSE: 128,
  KBDLOCK: 256,
  HIDE: 512,
  ECHO: 1024,
  APPCURSOR: 2048,
  MOUSESGR: 4096,
};
    

// 
// ## Term
//
// Represents the state of an emulated temrinal
//
// The `term` object is in charge of emulating the data received from the *tty*
// and compute the current state of the terminal (with help of vt.js)
//
// It also keeps track of the entire scrollback history composed of lines of
// glyphs. 
//
// Glyphs are tuples of the type: `[[CHAR_ATTR, fg_color, bg_color], char]`
//
// A `pty` object must be passed to the term object. It must comply to the
// following interface:
//
// - have a write method to write back data
// - emit `data` events when new data is received
//
// One can use the package pty.js by @chjj for that matter: 
// git://github.com/chjj/pty.js.git
//
// ```
// @inherits events.EventEmitter
// @param spec { pty, cols, rows }
//
// @emits `refresh`   [dirty, slice, cursor]
// @emits `alternate` [is_alt]
// @emits `title`     [title]
//
// @emits `resize`    [cols, rows]
// ```
// 
var term = function(spec, my) {
  var _super = {};
  my = my || {};

  //
  // #### _private members_
  //
  my.geometry = [spec.cols || 0, spec.rows || 0];  /* [cols, rows] */
  my.pty = spec.pty;
  my.vt = require('./vt.js').vt({});

  /* See `reset` for the initialization of the private variables relative */
  /* to the terminal state.                                               */

  my.saved_cursor = null;
  my.saved_screen = null;

  // 
  // #### _public methods_
  //
  var resize;         /* resize(cols, rows, silent); */
  var cursor;         /* cursor(); */

  //
  // #### _private methods_
  //
  var IS_SET;         /* IS_SET(x, bit); */
  var SET;            /* SET(x, bit); */
  var UNSET;          /* UNSET(x, bit); */

  var init;           /* init(); */
  var glyph;          /* glyph(char); */
  var reset;          /* reset(); */
  var save_cursor;    /* save_cursor() */
  var restore_cursor; /* restore_cursor() */
  var soft_reset;     /* soft_reset(); */
  var move_to;        /* move_to(x,y); */
  var new_line;       /* new_line([first_col]); */
  var setup_stops;    /* setup_stops(); */
  var next_stop;      /* next_stop(); */
  var prev_stop;      /* prev_stop(); */
  var dirty;          /* dirty(y); */
  var clear_region;   /* clear_region(x, y, cols, rows, char_value); */
  var delete_chars;   /* delete_chars(n); */
  var insert_chars;   /* insert_chars(n); */

  var blank_line;     /* blank_line(); */
  var scroll;         /* scroll(n); */
  var put_char;       /* put_char(c); */
  
  //
  // _that_
  //
  var that = new events.EventEmitter();

  /****************************************************************************/
  /*                          PRIVATE FUNCTIONS                               */
  /****************************************************************************/

  //
  // ### IS_SET
  // ```
  // @ x  {number} variable
  // @bit {number} checks if the `bit` is currently set in `mode`
  // ```
  // Helper function to check if a mode bit is set (bitwise operations)
  //
  IS_SET = function(x, bit) {
    return ((x & bit) != 0);
  };

  //
  // ### SET
  // ```
  // @x   {number} mode variable
  // @bit {number} mode bit to set
  // ```
  // Helper function to set a mode bit (bitwise operations)
  //
  SET = function(x, bit) {
    return x | bit;
  };

  //
  // ### UNSET
  // ```
  // @x   {number} mode variable
  // @bit {number} mode bit to unset
  // ```
  // Helper function to unset a mode bit (bitwise operations)
  //
  UNSET = function(x, bit) {
    return x & ~bit;
  };

  //
  // ### glyph
  // ```
  // @char {string} character to build the glyph from [optional, default: ' ']
  // @attr {number} override char attribute [optional]
  // ```
  // Builds a new glyph with the current cursor character attributes
  //
  glyph = function(char, attr) {
    return [
      (typeof attr !== 'undefined') ? attr : my.cursor.attr,
      (typeof char !== 'undefined') ? char : ' '
    ];
  };

  //
  // ### reset
  // Resets the terminal. Clears everything and refills the buffer with empty
  // data
  //
  reset = function() {
    my.mode = TERM_MODE.WRAP;
    my.cursor = {
      attr: 256 | (257 << 9) | (CHAR_ATTRS.NULL << 18),
      x: 0,
      y: 0,
      state: CURSOR_STATE.DEFAULT
    };
    my.tabs = {};
    my.buffer = [];
    my.title = null;

    my.base = 0;
    my.scroll = {
      top: 0,
      bottom: my.geometry[1] - 1
    };

    my.dirty = [];

    /* Resize to fill buffer & setup stops */
    resize(my.geometry[0], my.geometry[1], true);
  };

  //
  // ### soft_reset
  // Soft resets the terminal
  //
  soft_reset = function() {
    my.mode = TERM_MODE.WRAP;
    /* Reset scroll region */
    my.scroll = {
      top: 0,
      bottom: my.geometry[1] - 1
    };
  };

  //
  // ### save_cursor
  // Saves the current cursor state
  //
  save_cursor = function() {
    my.saved_cursor = my.cursor;
  };

  //
  // ### restore_cursor
  // Restores the saved cursor
  //
  restore_cursor = function() {
    my.cursor = my.saved_cursor;
    move_to(my.cursor.x, my.cursor.y);
  };


  //
  // ### setup_stops
  // ```
  // @pos {number} position from which to set tabs [optional]
  // ```
  // Setups tabs stop object given the current geometry. If `pos` is not defined
  // then tabs are reset entirely.
  //
  setup_stops = function(pos) {
    var i = 0;
    if(typeof pos !== 'number') {
      my.tabs = {};
    }
    else {
      i = prev_stop(Math.round(pos));
    }
    for(; i < my.geometry[0]; i += 8) {
      my.tabs[i] = true;
    }
  };
  

  //
  // ### prev_stop
  // ```
  // @x {number} position from which to jump [optional]
  // ```
  // Jumps to the previous tab_stops from x. If x is not specified then 
  // `my.cursor.x` is  used instead
  //
  prev_stop = function(x) {
    if(typeof x !== 'number') x = my.cursor.x;
    while(!my.tabs[--x] && x > 0);
    x = common.clamp(x, 0, my.geometry[0]-1);
    return x;
  };

  //
  // ### next_stop
  // ```
  // @x {number} position from which to jump [optional]
  // ```
  // Jumps to the next tab_stops from x. If x is not specified then 
  // `my.cursor.x` is used instead
  //
  next_stop = function(x) {
    if(typeof x !== 'number') x = my.cursor.x;
    while(!my.tabs[++x] && x < my.geometry[0]);
    x = common.clamp(x, 0, my.geometry[0]-1);
    return x;
  };

  //
  // ### dirty
  // ```
  // @y {number} extend dirtiness to buffer line 
  // ```
  // Make the specified buffer line dirty. We're in `buffer` line number 
  // referential (not visible screen).
  //
  dirty = function(y) {
    if(my.dirty.length === 0) {
      my.dirty = [y, y];
    }
    else { 
      if(my.dirty[0] > y) my.dirty[0] = y;
      if(my.dirty[1] < y) my.dirty[1] = y;
    }
  };

  //
  // ### blank_line
  // Generates a blank new line to be appended to the lines array when a new 
  // line needs to be created
  //
  blank_line = function() {
    var g = glyph();
    var line = [];
    for(var i = 0; i < my.geometry[0]; i ++) {
      line[i] = g;
    }
    return line;
  };

  //
  // ### scroll
  // ```
  // @n {number} number of lines to scroll
  // ```
  // Scrolls `n` lines. If `n>0`, it scrolls up, otherwise scrolls down. 
  // (`scroll(0)` has no effect)
  //
  scroll = function(n) {
    if(n >= 0) {
      for(var i = 0; i < n; i ++) {
        var row = ++my.base + my.scroll.bottom;
        my.buffer.splice(row, 0, blank_line());
      }
      /* TODO: handle my.scroll.top if needed              */
      /* if(my.scroll.top !== 0) {                         */
      /*   if(my.base > 0) my.base--;                      */
      /*   my.buffer.splice(my.base + my.scroll.top, 1);   */
      /* }                                                 */
    }
    else {
      var n = -n;
      for(var i = 0; i < n; i ++) {
        my.buffer.splice(my.base + my.scroll.bottom, 1);
        my.buffer.splice(my.base + my.scroll.top, 0, blank_line());
      }
    }
    dirty(my.base + my.scroll.bottom - n);
    dirty(my.base + my.scroll.bottom);
    /* TODO: selscroll? */
  };

  //
  // ### move_to
  // ```
  // @x        {number} cols position
  // @y        {number} rows position
  // @absolute {boolean} move with scroll region
  // ```
  // Moves to the specified position clamping it if necessary
  //
  move_to = function(x, y, absolute) {
    factory.log().debug('move_to: ' + x + ' ' + y + ' ' + absolute);
    var miny = 0;
    var maxy = my.geometry[1] - 1;
    if(IS_SET(my.cursor.state, CURSOR_STATE.ORIGIN)) {
      miny = my.scroll.top;
      maxy = my.scroll.bottom;
      if(!absolute) y += my.scroll.top;
    }
    my.cursor.state = UNSET(my.cursor.state, CURSOR_STATE.WRAPNEXT);
    dirty(my.base + my.cursor.y);
    my.cursor.x = common.clamp(x, 0, my.geometry[0]);
    my.cursor.y = common.clamp(y, miny, maxy);
    dirty(my.base + my.cursor.y);
  };

  //
  // ### new_line
  // ```
  // @first_col {boolean} moves to first column
  // ```
  // Moves one line down (and first_col if specified) and scrolls if needed.
  //
  new_line = function(first_col) {
    var y = my.cursor.y;
    if(my.cursor.y >= my.scroll.bottom) {
      scroll(1);
    }
    else {
      y += 1;
    }
    move_to(first_col ? 0 : my.cursor.x, y);
  };

  //
  // ### put_char
  // ```
  // @c {string} charchter to put
  // ```
  // Puts a single char taking care of wrapping
  //
  put_char = function(c) {
    if(IS_SET(my.mode, TERM_MODE.WRAP) && 
       (my.cursor.state & CURSOR_STATE.WRAPNEXT)) {
      new_line(true);
    }
    if(IS_SET(my.mode, TERM_MODE.INSERT) && 
       my.cursor.x + 1 < my.geometry[0]) {
      my.buffer[my.base + my.cursor.y].splice(my.cursor.x, 0, [glyph()]);
    }
    my.buffer[my.base + my.cursor.y][my.cursor.x] = glyph(c);
    if(my.cursor.x + 1 < my.geometry[0]) {
      move_to(my.cursor.x + 1, my.cursor.y);
    }
    else {
      my.cursor.state = SET(my.cursor.state, CURSOR_STATE.WRAPNEXT);
    }
    dirty(my.base + my.cursor.y);
  };

  //
  // ### clear_region
  // ```
  // @x {number} cols origin of region to clear [optional]
  // @y {number} rows origin of region to clear [optional]
  // @cols {number} number of columns to clear [optional]
  // @rows {number} number of rows to clear [optional]
  // @char_value {string} default char value to clear with [optional]
  // ```
  // Clears the region by resetting all glyphes to `char_value` if defined. It
  // clears the screen region independently of scroll region. If no parameter is
  // specified, it clears the entire screen;
  //
  clear_region = function(x, y, cols, rows, char_value) {
    x = (typeof x !== 'undefined') ? x : 0;
    y = (typeof y !== 'undefined') ? y : 0;
    x = common.clamp(x, 0, my.geometry[0] - 1);
    y = common.clamp(y, 0, my.geometry[1] - 1);

    cols = (typeof cols !== 'undefined') ? cols : my.geometry[0];
    rows = (typeof rows !== 'undefined') ? rows : my.geometry[1];
    var x_end = common.clamp(x + cols, 0, my.geometry[0]);
    var y_end = common.clamp(y + rows, 0, my.geometry[1]);

    for(var j = my.base + y; j < my.base + y_end; j ++) {
      for(var i = x; i < x_end; i ++) {
        my.buffer[j][i] = glyph(char_value);
      }
    }

    dirty(my.base + y);
    dirty(my.base + y_end);
  };

  //
  // ### delete_chars
  // ```
  // @n {number} number of characters to remove on the right
  // ```
  // Deletes `n` characters on the right sliding the whole line
  //
  delete_chars = function(n) {
    while(n--) {
      my.buffer[my.base + my.cursor.y].splice(my.cursor.x, 1);
      my.buffer[my.base + my.cursor.y].push(glyph());
    }
    dirty(my.base + my.cursor.y);
  };

  //
  // ### insert_chars
  // ```
  // @n {number} number of blank chars to insert
  // ```
  // Inserts `n` blank characters after the cursor. It clamps the insertion to
  // the current buffer geometry.
  //
  insert_chars = function(n) {
    var x = my.cursor.x
    while(n-- && x < my.geometry[0]) {
      my.buffer[my.base + my.cursor.y].splice(x++, 0, glyph());
      my.buffer[my.base + my.cursor.y].pop();
    }
    dirty(my.base + my.cursor.y);
  };

  /****************************************************************************/
  /*                           PUBLIC METHODS                                 */
  /****************************************************************************/

  //
  // ### resize
  // ```
  // @cols   {number} number of cols for the new geometry
  // @rows   {number} number of rows for the new geometry
  // @silent {boolean} silent resize (do not emit event)
  // ```
  // Resizes the current term emulator. This basically updates the `cols` and 
  // `rows private members
  //
  resize = function(cols, rows, silent) {
    if(cols < 1) cols = 1;
    if(rows < 1) rows = 1;

    var old = my.geometry;
    my.geometry = [Math.round(cols), Math.round(rows)];

    /* Resize cols */
    var len = my.buffer.length;
    while(len--) {
      if(my.geometry[0] >= old[0]) {
        while(my.buffer[len].length < my.geometry[0]) {
          my.buffer[len].push(glyph());
        }
      }
      else {
        while(my.buffer[len].length > my.geometry[0]) {
          my.buffer[len].pop();
        }
      }
    }

    /* setup stops */
    setup_stops(old[0]);

    /* Resize rows */
    while(my.buffer.length < my.geometry[1] + my.base) {
      my.buffer.push(blank_line());
    }
    while(my.buffer.length > my.geometry[1] + my.base) {
      my.buffer.pop();
    }
    
    /* Clamp cursor */
    move_to(my.cursor.x, my.cursor.y);
    /* Reset scroll region */
    my.scroll.top = 0;
    my.scroll.bottom = my.geometry[1] - 1;
    /* Set scoll region as dirty */
    dirty(my.base + my.scroll.top);
    dirty(my.base + my.scroll.bottom);

    if(!silent)
      that.emit('resize', my.geometry[0], my.geometry[1]);

    if(my.dirty.length > 0) {
      /* In the special case of resize, we compute the new slice and force */
      /* the dirty[1] to be as hight as the old geometry if needed         */
      var slice = my.buffer.slice(my.dirty[0], my.dirty[1] + 1);
      if(old[1] > my.geometry[1])
        dirty(my.base + old[1] - 1);
      that.emit('refresh', my.dirty, slice, cursor());
      my.dirty = [];
    }
  };

  //
  // ### cursor
  // Returns the cursor position 
  //
  cursor = function() {
    return {
      x: my.cursor.x,
      y: my.cursor.y
    };
  };


  //
  // ### initialize
  // Creates a `vt` instance and registers handlers and perform an initial
  // resize
  //
  init = function() {
    /**************************************************************************/
    /*                            DATA TRANSFER                               */
    /**************************************************************************/
    my.pty.on('data', function(buf) {
      try {
        my.vt.read(buf);
      }
      catch(err) {
        factory.log().error(err);
      }
      if(my.dirty.length > 0) {
        that.emit('refresh', my.dirty,
                  my.buffer.slice(my.dirty[0], my.dirty[1] + 1),
                  cursor());
        my.dirty = [];
      }
    });
    my.vt.on('print', function(str) {
      /* Supposed to be of length 1 */
      for(var i = 0; i < str.length; i ++) {
        put_char(str[i]);
      }
    });
    my.vt.on('write', function(data) {
      my.pty.write(data);
    });

    /**************************************************************************/
    /*                           CURSOR STORAGE                               */
    /**************************************************************************/
    my.vt.on('save_cursor', function() {
      save_cursor();
    });
    my.vt.on('restore_cursor', function() {
      restore_cursor();
    });

    /**************************************************************************/
    /*                          BUFFER MANAGEMENT                             */
    /**************************************************************************/
    my.vt.on('clear_home', function() {
      factory.log().debug('vt#clear_home');
      clear_region();
      move_to(0, 0);
    });
    my.vt.on('clear', function() {
      factory.log().debug('vt#clear');
      clear_region();
    });

    my.vt.on('reset', function() {
      reset();
    });
    my.vt.on('soft_reset', function() {
      soft_reset();
    });

    my.vt.on('resize', function(cols, rows) {
      /* We ignore it for now: 
      /* resize(cols || my.geometry[0], rows || my.geometry[1]); */
    });
    my.vt.on('fill', function(char_value) {
      clear_region(0, 0, my.geometry[0], my.geometry[1], char_value);
    });

    /**************************************************************************/
    /*                           CURSOR MOVEMENT                              */
    /**************************************************************************/
    my.vt.on('ring_bell', function() {
      /* TODO */
    });
    my.vt.on('cursor_left', function(n) {
      factory.log().debug('vt#cursor_left ' + n);
      n = (typeof n !== 'undefined' ) ? n : 1;
      move_to(my.cursor.x - n, my.cursor.y);
    });
    my.vt.on('cursor_down', function(n) {
      factory.log().debug('vt#cursor_down ' + n);
      n = (typeof n !== 'undefined' ) ? n : 1;
      move_to(my.cursor.x, my.cursor.y + n);
    });
    my.vt.on('cursor_up', function(n) {
      factory.log().debug('vt#cursor_up ' + n);
      n = (typeof n !== 'undefined' ) ? n : 1;
      move_to(my.cursor.x, my.cursor.y - n);
    });
    my.vt.on('cursor_right', function(n) {
      factory.log().debug('vt#cursor_right ' + n);
      n = (typeof n !== 'undefined' ) ? n : 1;
      move_to(my.cursor.x + n, my.cursor.y);
    });
    my.vt.on('set_cursor_column', function(x) {
      factory.log().debug('vt#set_cursor_column ' + x);
      /* Absolute */
      move_to(x, my.cursor.y, true);
    });
    my.vt.on('set_cursor_row', function(y) {
      factory.log().debug('vt#set_cursor_row ' + y);
      /* Absolute */
      move_to(my.cursor.x, y, true);
    });
    my.vt.on('set_cursor_position', function(y, x) {
      factory.log().debug('vt#set_cursor_position ' + x + ' ' + y);
      /* absolute move (take into account scroll region) */
      move_to(x, y, true);
    });

    my.vt.on('report_cursor_position', function() {
      var row = my.cursor.x + 1;
      var col = my.cursor.y + 1;
      my.pty.write('\x1b[' + row + ';' + col + 'R');
    });

    /**************************************************************************/
    /*                             LINE & TABS                                */
    /**************************************************************************/
    my.vt.on('line_feed', function() {
      factory.log().debug('vt#line_feed');
      new_line();
    });
    my.vt.on('reverse_line_feed', function() {
      if(my.cursor.y === my.scroll.top)
        scroll(-1);
      else
        move_to(my.cursor.x, my.cursor.y - 1);
    });
    my.vt.on('form_feed', function() {
      factory.log().debug('vt#form_feed');
      new_line(IS_SET(my.mode, TERM_MODE.CRLF));
    });

    my.vt.on('forward_tab_stop', function(n) {
      n = (typeof n !== 'undefined' ) ? n : 1;
      while(n--)
        my.cursor.x = next_stop();
    });
    my.vt.on('backward_tab_stop', function(n) {
      n = (typeof n !== 'undefined' ) ? n : 1;
      while(n--)
        my.cursor.x = prev_stop();
    });
    my.vt.on('clear_tab_stop', function() {
      delete my.tabs[my.cursor.x];
    });
    my.vt.on('clear_all_tab_stops', function() {
      my.tabs = {};
    });
    my.vt.on('set_tab_stop_current', function() {
      my.tabs[my.cursor.x] = true;
    });

    /**************************************************************************/
    /*                              CLIPBOARD                                 */
    /**************************************************************************/
    my.vt.on('copy_to_clipboard', function() {
      /* TODO: ignore for now */
    });

    /**************************************************************************/
    /*                               SCROLL                                   */
    /**************************************************************************/
    my.vt.on('scroll_up', function(n) {
      n = (typeof n !== 'undefined' ) ? n : 1;
      scroll(n);
    });
    my.vt.on('scroll_down', function(n) {
      n = (typeof n !== 'undefined' ) ? n : 1;
      scroll(-n);
    });

    /**************************************************************************/
    /*                              DELETION                                  */
    /**************************************************************************/
    my.vt.on('erase_below', function() {
      clear_region(my.cursor.x, my.cursor.y, my.geometry[0] - my.cursor.x, 1);
      if(my.cursor.y + 1 >= my.geometry[1]) return;
      clear_region(0, my.cursor.y + 1, 
                   my.geometry[0], my.geometry[1] - (my.cursor.y + 1));
    });
    my.vt.on('erase_above', function() {
      clear_region(0, my.cursor.y, my.cursor.x, 1);
      if(my.cursor.y - 1 <= 0) return;
      clear_region(0, 0, my.geometry[0], my.cursor.y - 1);
    });
    my.vt.on('erase_right', function(n) {
      n = (typeof n !== 'undefined') 
                   ? n : my.geometry[0] - my.cursor.x;
      clear_region(my.cursor.x, my.cursor.y, n, 1);
    });
    my.vt.on('erase_left', function() {
      clear_region(0, my.cursor.y, my.cursor.x, 1);
    });
    my.vt.on('erase_line', function() {
      clear_region(0, my.cursor.y, my.geometry[0], 1);
    });
    my.vt.on('delete_lines', function(n) {
      n = (typeof n !== 'undefined') ? n : 1;
      if(my.cursor.y < my.scroll.top || my.cursor.y > my.scroll.bottom)
        return;
      scroll(n);
    });
    my.vt.on('insert_lines', function(n) {
      n = (typeof n !== 'undefined') ? n : 1;
      if(my.cursor.y < my.scroll.top || my.cursor.y > my.scroll.bottom)
        return;
      scroll(-n);
    });
    my.vt.on('delete_chars', function(n) {
      n = (typeof n !== 'undefined') ? n : 1;
      delete_chars(n);
    });
    my.vt.on('insert_chars', function() {
      n = (typeof n !== 'undefined') ? n : 1;
      insert_chars(n);
    });

    /**************************************************************************/
    /*                             ANSI MODES                                 */
    /**************************************************************************/
    my.vt.on('set_insert_mode', function(val) {
      if(val) my.mode = SET(my.mode, TERM_MODE.INSERT);
      else my.mode = UNSET(my.mode, TERM_MODE.INSERT);
    });
    my.vt.on('set_auto_carriage_return', function(val) {
      if(val) my.mode = SET(my.mode, TERM_MODE.CRLF);
      else my.mode = UNSET(my.mode, TERM_MODE.CRLF);
    });

    /**************************************************************************/
    /*                             DEC MODES                                  */
    /**************************************************************************/
    my.vt.on('set_application_cursor', function(val) {
      if(val) my.mode = SET(my.mode, TERM_MODE.APPCURSOR);
      else my.mode = UNSET(my.mode, TERM_MODE.APPCURSOR);
      /* TODO: handle */
    });
    my.vt.on('set_scroll_region', function(top, bottom) {
      factory.log().out('{set_scroll_region} ' + top + ' - ' + bottom);
      if(top) my.scroll.top = common.clamp(top, 0, my.geometry[1] - 1);
      if(bottom) my.scroll.bottom = common.clamp(bottom, 0, my.geometry[1] - 1);
    });
    my.vt.on('set_reverse_video', function(val) {
      var m = my.mode;
      if(val) m = SET(m, TERM_MODE.REVERSE);
      else m = UNSET(m, TERM_MODE.REVERSE);
      if(m !== my.mode) {
        my.mode = m;
        /* TODO: handle */
      }
    });
    my.vt.on('set_origin_mode', function(val) {
      if(val) my.cursor.state = SET(my.cursor.state, CURSOR_STATE.ORIGIN);
      else my.cursor.state = UNSET(my.cursor.state, CURSOR_STATE.ORIGIN);
    });
    my.vt.on('set_wrap_around', function(val) {
      if(val) my.mode = SET(my.mode, TERM_MODE.WRAP);
      else my.mode = UNSET(my.mode, TERM_MODE.WRAP);
    });
    my.vt.on('set_cursor_blink', function(val) {
      /* TODO: ignore for now */
    });
    my.vt.on('set_cursor_visible', function(val) {
      if(val) my.mode = UNSET(my.mode, TERM_MODE.HIDE);
      else my.mode = SET(my.mode, TERM_MODE.HIDE);
        /* TODO: handle */
    });
    my.vt.on('set_reverse_wrap_around', function() {
      /* TODO: ignore for now */
    });
    my.vt.on('set_keyboard_backspace_sends_backspace', function() {
      /* TODO: ignore for now */
    });
    my.vt.on('set_scroll_on_output', function() {
      /* TODO: ignore for now */
    });
    my.vt.on('set_scroll_on_keystroke', function() {
      /* TODO: ignore for now */
    });
    my.vt.on('set_keyboard_meta_sends_escape', function() {
      /* TODO: ignore for now */
    });
    my.vt.on('set_keyboard_alt_sends_escape', function() {
      /* TODO: ignore for now */
    });
    my.vt.on('set_alternate_mode', function(alt) {
      if(alt) {
        my.saved_screen = {
          mode: my.mode,
          buffer: my.buffer,
          base: my.base,
          cursor: my.cursor,
          scroll: my.scroll,
          tabs: my.tabs
        }
        /* We first clear the buffer so that an empty buffer is transmitted   */
        /* with the `alternate` event (to be filled right after with the call */
        /* to `reset`                                                         */
        my.buffer = []; 
        that.emit('alternate', true);
        reset();
        my.mode = SET(my.mode, TERM_MODE.ALTSCREEN);
      }
      else {
        if(my.saved_screen) {
          my.mode = my.saved_screen.mode;
          my.cursor = my.saved_screen.cursor;
          my.scroll = my.saved_screen.scroll;
          my.tabs = my.saved_screen.tabs;
          my.base = my.saved_screen.base;
          my.buffer = my.saved_screen.buffer;
        }
        my.mode = UNSET(my.mode, TERM_MODE.ALTSCREEN);
        that.emit('alternate', false);
        my.dirty = [];
      }
    });

    my.vt.on('set_application_keypad', function(val) {
      if(val) my.mode = SET(my.mode, TERM_MODE.APPKEYPAD);
      else my.mode = UNSET(my.mode, TERM_MODE.APPKEYPAD);
      /* TODO: handle */
    });
    my.vt.on('set_window_title', function(title) {
      my.title = title;
      that.emit('title', my.title);
    });

    /**************************************************************************/
    /*                          CHARACTER ATTRS                               */
    /**************************************************************************/
    my.vt.on('char_attr_reset', function() {
      my.cursor.attr = 256 | (257 << 9) | (CHAR_ATTRS.NULL << 18);
    });
    my.vt.on('char_attr_set_bold', function(val) {
      if(val) my.cursor.attr = SET(my.cursor.attr, CHAR_ATTRS.BOLD << 18);
      else my.cursor.attr = UNSET(my.cursor.attr, CHAR_ATTRS.BOLD << 18);
    });
    my.vt.on('char_attr_set_italic', function(val) {
      if(val) my.cursor.attr = SET(my.cursor.attr, CHAR_ATTRS.ITALIC << 18);
      else my.cursor.attr = UNSET(my.cursor.attr, CHAR_ATTRS.ITALIC << 18);
    });
    my.vt.on('char_attr_set_underline', function(val) {
      if(val) my.cursor.attr = SET(my.cursor.attr, CHAR_ATTRS.UNDERLINE << 18);
      else my.cursor.attr = UNSET(my.cursor.attr, CHAR_ATTRS.UNDERLINE << 18);
    });
    my.vt.on('char_attr_set_blink', function(val) {
      if(val) my.cursor.attr = SET(my.cursor.attr, CHAR_ATTRS.BLINK << 18);
      else my.cursor.attr = UNSET(my.cursor.attr, CHAR_ATTRS.BLINK << 18);
    });
    my.vt.on('char_attr_set_reverse', function(val) {
      if(val) my.cursor.attr = SET(my.cursor.attr, CHAR_ATTRS.REVERSE << 18);
      else my.cursor.attr = UNSET(my.cursor.attr, CHAR_ATTRS.REVERSE << 18);
    });
    my.vt.on('char_attr_set_invisible', function(val) {
      /* TODO: ignore for now */
    });

    my.vt.on('char_attr_set_foreground_index', function(idx) {
      if(idx) {
        my.cursor.attr = UNSET(my.cursor.attr, 0x11f << 9);
        my.cursor.attr = SET(my.cursor.attr, idx << 9)
      }
      else {
        my.cursor.attr = UNSET(my.cursor.attr, 0x11f << 9);
        my.cursor.attr = SET(my.cursor.attr, 257 << 9);
      }
    });
    my.vt.on('char_attr_set_background_index', function(idx) {
      if(idx) {
        my.cursor.attr = UNSET(my.cursor.attr, 0x11f);
        my.cursor.attr = SET(my.cursor.attr, idx)
      }
      else {
        my.cursor.attr = UNSET(my.cursor.attr, 0x11f);
        my.cursor.attr = SET(my.cursor.attr, 256);
      }
    });

    /* Finally reset (will resize to specified geometry) */
    reset();
  };

  //
  // #### _initialization_
  //
  init();

  common.getter(that, 'buffer', my, 'buffer');
  common.getter(that, 'title', my, 'title');
  common.getter(that, 'mode', my, 'mode');
  common.getter(that, 'pty', my, 'pty');

  common.method(that, 'resize', resize, _super);
  common.method(that, 'cursor', cursor, _super);

  return that;
};

exports.term = term;

