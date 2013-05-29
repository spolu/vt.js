/*
 * vt.js: vt.js
 *
 * Copyright (c) 2013, Stanislas Polu. All rights reserved.
 * (see LICENSE file)
 *
 * @log
 * - 20130514 @spolu    Fixes to properly run vim
 * - 20130510 @spolu    Fixes first time running vim
 * - 20130429 @spolu    First stabilized API
 * - 20130410 @spolu    Fork from hterm
 */
'use strict';

var common = require('./common.js');
var events = require('events');
var util = require('util');
var factory = common.factory;


//
// ## state
//
// Helper class to represent the parser state
// ```
// @inherits {}
// @spec {object} { def_fun }
// ```
// 
var state = function(spec, my) {
  var _super = {};
  my = my || {};

  //
  // #### _private members_
  //
  my.def_fun = spec.def_fun
  my.buf = null;
  my.pos = 0;
  my.fun = my.def_fun;
  my.args = [];

  //
  // #### _public methods_
  //
  var reset_fun;   /* reset_fun(); */
  var reset_buf;   /* reset_buf([buf]); */
  var reset_args   /* reset_args(); */
  var reset;       /* reset([buf]); */
  var int_arg;     /* int_arg(pos, [def_value]); */
  var advance;     /* advance(count); */
  var peek_buf;    /* peek_buf(); */
  var peek;        /* peek(); */
  var consume;     /* consume(); */
  var is_complete; /* is_complete(); */
  
  //
  // #### _that_
  //
  var that = {};


  //
  // ### reset_fun
  // Resets the parser function only.
  // 
  reset_fun = function() {
    my.fun = my.def_fun;
  };

  //
  // ### reset_buf
  // ```
  // @buf {string} optional value for buffer (defaults to null)
  // ```
  // Resets the buffer and position only.
  //
  reset_buf = function(buf) {
    my.buf = (typeof buf === 'string') ? buf : null;
    my.pos = 0;
  };

  //
  // ### reset_args
  // ```
  // @arg {string} optional value for args[0]
  // ```
  // Resets the arguments list only
  //
  reset_args = function(arg) {
    my.args = [];
    if(typeof arg !== 'undefined') {
      my.args[0] = arg;
    }
  };

  //
  // ### reset
  // ```
  // @buf {string} optional value for buffer
  // ```
  // Reset the parser state
  //
  reset = function(buf) {
    that.reset_fun();
    that.reset_buf(buf);
    that.reset_args();
  };

  //
  // ### int_arg
  // ```
  // @pos {number} the argument number to retrieve
  // @def {numnber} the default value to return
  // ```
  // Get an argument as an integer.
  // 
  int_arg = function(pos, def) {
    var str = my.args[pos];
    if(str) {
      var ret = parseInt(str, 10);
      if(ret === 0)
        ret = def;
      return ret;
    }
    return def;
  };

  //
  // ### advance
  // ```
  // @count {number} the number of bytes to advance
  // ```
  // Advances the parse position 
  //
  advance = function(count) {
    my.pos += count;
  };

  //
  // ### peek_buf
  // Return the remaining portion of the buffer without affecting the state.
  //
  peek_buf = function() {
    return my.buf.substr(my.pos);
  };

  //
  // ### peek
  // Return the next character of the buffer without affecting the state.
  // 
  peek = function() {
    return my.buf.substr(my.pos, 1);
  };

  //
  // ### consume_char
  // Return the next character in the buffer and advance the parse
  // position of one byte.
  //
  consume = function() {
    return my.buf.substr(my.pos++, 1);
  };

  //
  // ### is_complete
  // Returns whether the buffer is empty or the position is past
  // the end.
  //
  is_complete = function() {
    return my.buf === null || my.buf.length <= my.pos;
  };


  common.method(that, 'reset_fun', reset_fun, _super);
  common.method(that, 'reset_buf', reset_buf, _super);
  common.method(that, 'reset_args', reset_args, _super);
  common.method(that, 'reset', reset, _super);
  common.method(that, 'int_arg',int_arg , _super);
  common.method(that, 'advance', advance, _super);
  common.method(that, 'peek_buf', peek_buf, _super);
  common.method(that, 'peek', peek, _super);
  common.method(that, 'consume', consume, _super);
  common.method(that, 'is_complete', is_complete, _super);

  common.getter(that, 'buf', my, 'buf');
  common.getter(that, 'pos', my, 'pos');
  common.getter(that, 'fun', my, 'fun');
  common.setter(that, 'fun', my, 'fun');
  common.getter(that, 'args', my, 'args');

  return that;
};



//
// ## vt
//
// Escape sequence interpreter 
//
// The `vt` object is in charge of parsing and interpreting the
// sequence sent to the terminal and pass them to the terminal
// to execute cursor operations.
//
// Originally forked from:
// Chromium's hterm [http://goo.gl/3i5AJ]
// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// <http://src.chromium.org/viewvc/chrome/trunk/src/LICENSE?view=markup>
//
// #### Guides:
// 
// - [VT100] VT100 User Guide
//   http://vt100.net/docs/vt100-ug/chapter3.html
// - [VT510] VT510 Video Terminal Programmer Information
//   http://vt100.net/docs/vt510-rm/contents
// - [XTERM] Xterm Control Sequences
//   http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
// - [CTRL]  Wikipedia: C0 and C1 Control Codes
//   http://en.wikipedia.org/wiki/C0_and_C1_control_codes
// - [CSI]   Wikipedia: ANSI Escape Code
//   http://en.wikipedia.org/wiki/Control_Sequence_Introducer
//
// ```
// @spec {object} { 
//     allow_width_change,  [optional]
//     osc_time_limit,      [optional]
//     max_string_sequence, [optional]
//     warn                 [optional]
//  }
// ```
// 
var vt = function(spec, my) {
  var _super = {};
  my = my || {};

  //
  // #### _protected methods_
  // 
  var parse_unknown;  /* parse_unknown(); */

  // 
  // #### _private methods_
  //
  var save_cursor;                   /* cursor_save(); */
  var restore_cursor;                /* cursor_reset(); */
  var parse_unknown;                 /* parse_unknown(); */
  var parse_csi;                     /* parse_csi(); */
  var parse_until_string_terminator; /* parse_until_string_terminator */
  var dispatch;                      /* dispatch(); */
  var ignore;                        /* ignore(); */
  var set_ansi_mode;                 /* set_ansi_mode(code, state); */
  var set_dec_mode;                  /* set_dec_mode(code, state); */

  //
  // #### _private members_
  //
  my.state = null;
  my.leading_modifier = '';
  my.trailing_modifier = '';
  my.allow_width_change = spec.allow_width_change || true;
  my.osc_time_limit = spec.osc_time_limit || 2000;
  my.max_string_sequence = spec.max_string_sequence || 1024;
  my.warn = spec.warn || true;
  my.saved_state = {};

  //
  // #### _public methods_
  //
  var reset;      /* reset(); */
  var read;       /* read(); */
  
  var that = new events.EventEmitter();

  //
  // ### cursor_save
  // Saves the cursor state and emits a `save_cursor` event for the terminal
  // to save its actual cursor state.
  //
  save_cursor = function() {
    my.saved_state = {
      GL: my.GL,
      GR: my.GR,

      G0: my.G0,
      G1: my.G1,
      G2: my.G2,
      G4: my.G3
    };

    /* Saves cursor and text attributes */
    that.emit('save_cursor');
  };

  //
  // ### cursor_restore
  // Restores the cursor state and emits a `restor_cursor` event for the
  // terminal to restor its cursor state.
  // 
  restore_cursor = function() {
    my.GL = my.saved_state.GL;
    my.GR = my.saved_state.GR;

    my.G0 = my.saved_state.G0;
    my.G1 = my.saved_state.G1;
    my.G2 = my.saved_state.G2;
    my.G3 = my.saved_state.G3;

    /* Restores cursor and text attributes */
    that.emit('restore_cursor');
  }


  //
  // ### reset
  // Resets the VT to its initial default state
  //
  reset = function() {
    /* We initialize the state here if not already done since we need to */
    /* wait for parse_unknown to be defined to construct it              */
    if(!my.state)
      my.state = state({ def_fun: parse_unknown })

    my.G0 = require('./char_map.js').maps['B'];
    my.G1 = require('./char_map.js').maps['0'];
    my.G2 = require('./char_map.js').maps['B'];
    my.G3 = require('./char_map.js').maps['B'];

    my.GL = 'G0';
    my.GR = 'G0';

    my.saved_state = {
      GL: my.GL,
      GR: my.GR,
      G0: my.G0,
      G1: my.G1,
      G2: my.G2,
      G4: my.G3
    };
  };

  //
  // ### read
  // ```
  // @buf The string bufffer to read
  // ```
  // Reads a string of character, inteprets it and pass it the the
  // underlying terminal
  //
  read = function(buf) {
    var str = buf;
    str = str.replace(/\x00/g, '\\x00');
    str = str.replace(/\x05/g, '\\x05');
    str = str.replace(/\x07/g, '\\x07');
    str = str.replace(/\x08/g, '\\x08');
    str = str.replace(/\x09/g, '\\x09');
    str = str.replace(/\x0a/g, '\\x0a');
    str = str.replace(/\x0b/g, '\\x0b');
    str = str.replace(/\x0c/g, '\\x0c');
    str = str.replace(/\x0d/g, '\\x0d');
    str = str.replace(/\x0e/g, '\\x0e');
    str = str.replace(/\x0f/g, '\\x0f');
    str = str.replace(/\x11/g, '\\x11');
    str = str.replace(/\x13/g, '\\x13');
    str = str.replace(/\x18/g, '\\x18');
    str = str.replace(/\x1a/g, '\\x1a');
    str = str.replace(/\x1b/g, '\\x1b');
    str = str.replace(/\x7f/g, '\\x7f');
    factory.log().debug('PTY: ' + str);

    my.state.reset_buf(buf.toString('utf8'));

    while(!my.state.is_complete()) {
      var fun = my.state.fun();
      var buf = my.state.buf();
      var pos = my.state.pos();

      my.state.fun()();
      if(my.state.fun() === fun &&
         my.state.buf() === buf &&
         my.state.pos() === pos) {
        throw new Error('Parser `fun` failed to alter state');
      }
    }
  };

  /****************************************************************************/
  /*                               PARSERS                                    */
  /****************************************************************************/

  //
  // ### parse_unknown
  // Default parse function. Scans the string for 1-byte control character
  // (C0/C1 from [CTRL]). Any plain text coming before the code will be printed
  // normally to the terminal, the the control character will be dispatched.
  //
  parse_unknown = function() {
    function print(str) {
      var str;
      if(my[my.GL].GL)
        str = my[my.GL].GL(str);
      if(my[my.GR].RL)
        str = my[my.GR].GR(str);
      that.emit('print', str);
    };

    var buf = my.state.peek_buf();
    var next_control = buf.search(my.cc1_r);

    if(next_control === 0) {
      /* We just stumbled into a control character */
      dispatch('CC1', buf.substr(0, 1));
      my.state.advance(1);
    }
    else if(next_control === -1) {
      /* No control character, we print */
      print(buf);
      my.state.reset();
    }
    else {
      print(buf.substr(0, next_control));
      dispatch('CC1', buf.substr(next_control, 1));
      my.state.advance(next_control + 1);
    }
  };


  //
  // ### parse_csi
  // Parse a Control Sequence Introducer code and dispatch it
  //
  parse_csi = function() {
    var ch = my.state.peek();
    var args = my.state.args();

    if(ch >= '@' && ch <= '~') {
      /* This is the final character */
      dispatch('CSI', my.leading_modifier + my.trailing_modifier + ch);
      my.state.reset_fun();
    }
    else if(ch === ';') {
      /* Parameter delimiter */
      if(my.trailing_modifier) {
        /* Parameter delimiter after the trailing modifier. paddlin' */
        my.state.reset_fun();
      }
      else {
        if(!args.length) {
          /* They omitted the first param. we supply it */
          args.push('');
        }
        args.push('');
      }
    }
    else if (ch >= '0' && ch <= '9') {
      if(my.trailing_modifier) {
        my.state.reset_fun();
      }
      else if(!args.length) {
        args[0] = ch;
      }
      else {
        args[args.length - 1] += ch;
      }
    }
    else if (ch >= ' ' && ch <= '?' && ch != ':') {
      if(!args.length) {
        my.leading_modifier += ch;
      }
      else {
        my.trailing_modifier += ch;
      }
    }
    else if (my.cc1_r.test(ch)) {
      dispatch('CC1', ch);
    }
    else {
      my.state.reset_fun();
    }
    my.state.advance(1);
  };

  //
  // ### parse_until_string_terminator
  // ```
  // @return {boolean} if true, parsing is complete else it exceeded
  // ```
  // Skip over the string until the next String Terminator (ST, 'ESC \') or
  // Bell (BEL, '\x07')
  //
  parse_until_string_terminator = function() {
    var buf = my.state.peek_buf();
    var next_terminator = buf.search(/(\x1b\\|\x07)/);
    var args = my.state.args();

    if(!args.length) {
      args[0] = '';
      args[1] = new Date();
    }

    if(next_terminator === -1) {
      /* No terminator here, have to wait for the next string */
      args[0] += buf;

      var abort;
      if(args[0].length > my.max_string_sequence)
        abort = 'Too long: ' + args[0].length;
      if(args[0].indexOf('\x1b') !== -1)
        abort = 'Embedded escape: ' + args[0].indexOf('\x1b');
      if(new Date() - args[1] > my.osc_time_limit)
        abort = 'Timeout expired: ' + (new Date() - args[1]);

      if(abort) {
        factory.log().out('`parse_until_string_terminator` aborting: ' + 
                          abort + ' [' + args[0] + ']');
        my.state.reset(args[0]);
        return false;
      }
      
      my.state.advance(buf.length);
      return true;
    }
    else if((args[0].length + next_terminator) > my.max_string_sequence) {
      /* Found the end of sequence but it's too long */
      my.state.reset(args[0] + buf);
      return false;
    }
    else {
      /* Found the terminator. String is accumulated in args[0] */
      args[0] += buf.substr(0, next_terminator);
      my.state.reset_fun();
      my.state.advance(next_terminator +
                             (buf.substr(next_terminator, 1) === '\x1b' ? 
                              2 : 1));
      return true;
    }
  };

  /****************************************************************************/
  /*                               DISPATCH                                   */
  /****************************************************************************/

  //
  // ### dispatch
  // ```
  // @type {string} the escape sequence type
  // @code {string} the escape sequence code
  // ```
  // Dispatch to the function that handles the given CC1, ESC, CSI or VT52 code
  //
  dispatch = function(type, code) {
    var handler = my[type][code];
    if(!handler || handler === ignore) {
      if(my.warn) {
        factory.log().out('Unknown/Ignore ' + type + ' code: ' + code);
        /* factory.log().out(new Error().stack); */
      }
      return;
    }
    if(type === 'CC1' && code > '\x7f') {
      /* We don't handle 8-bit controls. So let's just ignore */
      if(my.warn) {
        factory.log().out('Ignored 8-bit control code: 0x' + 
                          code.charCodeAt(0).toString(16));
      }
      return;
    }
    return handler(code);
  };

  /****************************************************************************/
  /*                                  MODES                                   */
  /****************************************************************************/

  //
  // ### set_ansi_mode
  // ```
  // @code {string} the code of the ANSI mode to switch to
  // @state {boolean} mode state
  // ```
  // Set one o the ANSI defined terminal mode bits
  //
  set_ansi_mode = function(code, state) {
    if(code === '4')
      that.emit('set_insert_mode', state)
    else if(code === '20')
      that.emit('set_auto_carriage_return', state)
    else if(my.warn)
      factory.log().out('Unimplemented ANSI Mode: ' + code);
  };

  //
  // ### set_dec_mode
  // ```
  // @code {string} the code of the DEC mode to switch to
  // @state {boolean} mode state
  // ```
  // Invoked in response to DECSET/DECRST.
  // Expected values for code:
  //     1 - Application Cursor Keys (DECCKM).
  //     2 - [!] Designate USASCII for character sets G0-G3 (DECANM), and set
  //         VT100 mode.
  //     3 - 132 Column Mode (DECCOLM).
  //     4 - [x] Smooth (Slow) Scroll (DECSCLM).
  //     5 - Reverse Video (DECSCNM).
  //     6 - Origin Mode (DECOM).
  //     7 - Wraparound Mode (DECAWM).
  //     8 - [x] Auto-repeat Keys (DECARM).
  //     9 - [!] Send Mouse X & Y on button press.
  //    10 - [x] Show toolbar (rxvt).
  //    12 - Start Blinking Cursor (att610).
  //    18 - [!] Print form feed (DECPFF).
  //    19 - [x] Set print extent to full screen (DECPEX).
  //    25 - Show Cursor (DECTCEM).
  //    30 - [!] Show scrollbar (rxvt).
  //    35 - [x] Enable font-shifting functions (rxvt).
  //    38 - [x] Enter Tektronix Mode (DECTEK).
  //    40 - Allow 80 - 132 Mode.
  //    41 - [!] more(1) fix (see curses resource).
  //    42 - [!] Enable Nation Replacement Character sets (DECNRCM).
  //    44 - [!] Turn On Margin Bell.
  //    45 - Reverse-wraparound Mode.
  //    46 - [x] Start Logging.
  //    47 - [!] Use Alternate Screen Buffer.
  //    66 - [!] Application keypad (DECNKM).
  //    67 - Backarrow key sends backspace (DECBKM).
  //  1000 - Send Mouse X & Y on button press and release.  (MOUSE_REPORT_CLICK)
  //  1001 - [!] Use Hilite Mouse Tracking.
  //  1002 - Use Cell Motion Mouse Tracking.  (MOUSE_REPORT_DRAG)
  //  1003 - [!] Use All Motion Mouse Tracking.
  //  1004 - [!] Send FocusIn/FocusOut events.
  //  1005 - [!] Enable Extended Mouse Mode.
  //  1010 - Scroll to bottom on tty output (rxvt).
  //  1011 - Scroll to bottom on key press (rxvt).
  //  1034 - [x] Interpret "meta" key, sets eighth bit.
  //  1035 - [x] Enable special modifiers for Alt and NumLock keys.
  //  1036 - Send ESC when Meta modifies a key.
  //  1037 - [!] Send DEL from the editing-keypad Delete key.
  //  1039 - Send ESC when Alt modifies a key.
  //  1040 - [x] Keep selection even if not highlighted.
  //  1041 - [x] Use the CLIPBOARD selection.
  //  1042 - [!] Enable Urgency window manager hint when Control-G is received.
  //  1043 - [!] Enable raising of the window when Control-G is received.
  //  1047 - [!] Use Alternate Screen Buffer.
  //  1048 - Save cursor as in DECSC.
  //  1049 - Save cursor as in DECSC and use Alternate Screen Buffer, clearing
  //         it first. (This may be disabled by the titeInhibit resource). This
  //         combines the effects of the 1047 and 1048 modes. Use this with
  //         terminfo-based applications rather than the 47 mode.
  //  1050 - [!] Set terminfo/termcap function-key mode.
  //  1051 - [x] Set Sun function-key mode.
  //  1052 - [x] Set HP function-key mode.
  //  1053 - [x] Set SCO function-key mode.
  //  1060 - [x] Set legacy keyboard emulation (X11R6).
  //  1061 - [!] Set VT220 keyboard emulation.
  //  2004 - [!] Set bracketed paste mode.
  //   
  // [!] - Not currently implemented, may be in the future.
  // [x] - Will not implement.
  //
  set_dec_mode = function(code, state) {
    switch(code) {
      case '1': {
        that.emit('set_application_cursor', state);
        break;
      }
      case '3': {
        if(my.allow_width_change) {
          that.emit('resize', state ? 132 : 80);
          that.emit('clear_home');
        }
        break;
      }
      case '5': {
        that.emit('set_reverse_video', state);
        break;
      }
      case '6': {
        that.emit('set_origin_mode', state);
        that.emit('set_cursor_position', 0, 0);
        break;
      }
      case '7': {
        that.emit('set_wrap_around', state);
        break;
      }
      case '12': {
        that.emit('set_cursor_blink', state);
        break;
      }
      case '25': {
        that.emit('set_cursor_visible', state);
        break;
      }
      case '40': {
        my.allow_width_change = state ? true : false;
        break;
      }
      case '45': {
        that.emit('set_reverse_wrap_around', state);
        break;
      }
      case '67': {
        that.emit('set_keyboard_backspace_sends_backspace', state);
        break;
      }
      case '1000': {
        /* TODO: mouse */
        break;
      }
      case '1002': {
        /* TODO: mouse */
        break;
      }
      case '1010': {
        that.emit('set_scroll_on_output', state);
        break;
      }
      case '1011': {
        that.emit('set_scroll_on_keystroke', state);
        break;
      }
      case '1036': {
        that.emit('set_keyboard_meta_sends_escape', state);
        break;
      }
      case '1039': {
        that.emit('set_keyboard_alt_sends_escape', state);
        break;
      }
      case '47':
      case '1047': {
        that.emit('set_alternate_mode', state);
        break;
      }
      case '1048': {
        save_cursor();
        break;
      }
      case '1049': {
        if(state) {
          save_cursor();
          that.emit('set_alternate_mode', state);
          that.emit('clear');
        }
        else {
          that.emit('set_alternate_mode', state);
          restore_cursor();
        }
        break;
      }
      default: {
        if(my.warn)
          factory.log().out('Unimplemented DEC Private Mode: ' + code);
      }
    }
  };



  /****************************************************************************/
  /*                             CONTROL SEQUENCES                            */
  /****************************************************************************/

  //
  // ### ignore
  // Ignore handler use to ignore an action and test equality
  //
  ignore = function() {};

  //
  // ### CC1
  // Collection of control chracters expressed in a single byte.
  //
  my.CC1 = {
    // Null (NUL)
    '\x00': function() {},
    // Enquiry (ENQ)
    '\x05': ignore,
    // Ring Bell (BEL)
    '\x07': function() {
      that.emit('ring_bell');
    },
    // Backspace (BS)
    '\x08': function() {
      that.emit('cursor_left', 1);
    },
    // Horizontal Tab (HT)
    '\x09': function() {
      that.emit('forward_tab_stop');
    },
    // Line Feed (LF)
    '\x0a': function() {
      that.emit('line_feed');
    },
    // Vertical Tab (VT)
    '\x0b': function() {
      that.emit('form_feed');
    },
    // Form Feed (FF)
    '\x0c': function() {
      that.emit('form_feed');
    },
    // Carriage Return (CR)
    '\x0d': function() {
      that.emit('set_cursor_column', 0);
    },
    // Shift Out (SO), aka Lock Shift 1 (LS1)
    '\x0e': function() {
      my.GL = 'G1';
    },
    // Shift In (SI), aka Lock Shift 0 (LS0)
    '\x0f': function() {
      my.GL = 'G0';
    },
    // Transmit On (XON)
    '\x11': ignore,
    // Transmit Off (XOFF)
    '\x13': ignore,
    // Cancel (CAN)
    '\x18': function() {
      my.state.reset_fun();
      that.emit('print', '?');
    },
    // Substitute (SUB)
    '\x1a': function() {
      my.state.reset_fun();
      that.emit('print', '?');
    },
    // Escape (ESC)
    '\x1b': function() {
      function parse_esc() {
        var ch = my.state.consume();
        if(ch === '\x1b')
          return;
        dispatch('ESC', ch);
        if(my.state.fun() === parse_esc)
          my.state.reset_fun();
      };
      my.state.set_fun(parse_esc);
    },
    // Delete (DEL)
    '\x7f': ignore
  };

  //
  // ### CC1 Regexp
  // Constructed to quickly scan the known 1-byte control chars
  //
  var acc = Object.keys(my.CC1).map(function(e) {
    return '\\x' + common.zpad(e.charCodeAt().toString(16), 2)
  }).join('');
  my.cc1_r = new RegExp('[' + acc + ']');


  //
  // ### ESC
  // Collection of control two-byte and three-byte sequences 
  // starting with ESC.
  //
  my.ESC = {
    // Index (IND)
    'D': function() {
      that.emit('line_feed');
    },
    // Next Line (NEL)
    'E': function() {
      that.emit('set_cursor_column', 0);
      that.emit('cursor_down', 1);
    },
    // Horizontal Tabulation Set (HTS)
    'H': function() {
      that.emit('set_tab_stop_current');
    },
    // Reverse Index (RI)
    'M': function() {
      that.emit('reverse_line_feed');
    },
    // Single Shift 2 (SS2)
    'N': ignore,
    // Single Shift 3 (SS3)
    'O': ignore,
    // Device Control String (DCS)
    'P': function() {
      my.state.reset_args();
      my.state.set_fun(parse_until_string_terminator);
    },
    // Start of Pretected Area (SPA)
    'V': ignore,
    // End of Protected Area (EPA)
    'W': ignore,
    // Start of String (SOS)
    'X': ignore,
    // Single Character Introducer (SCI, also DECID)
    'Z': function() {
      that.emit('write', '\x1b[?1;2c');
    },
    // Control Sequence Introducer (CSI)
    '[': function() {
      my.state.reset_args();
      my.leading_modifier = '';
      my.trailing_modifier = '';
      my.state.set_fun(parse_csi);
    },
    // String Terminator (ST)
    '\\': ignore,
    // Operating System Command (OSC)
    ']': function() {
      my.state.reset_args();
      function parse_osc() {
        if(!parse_until_string_terminator()) {
          /* The string was too long or invalid */
          return;
        }
        else if(my.state.fun() === parse_osc) {
          /* We're not done parsing the string yet */
          return;
        }
        else {
          /* We're done */
          var ary_r = /^(\d+);(.*)$/;
          var ary_m = my.state.args()[0].match(ary_r);
          if(ary_m) {
            my.state.args()[0] = ary_m[2];
            dispatch('OSC', ary_m[1]);
          }
          else {
            factory.log().out('Invalid OSC: ' + my.state.args()[0]);
          }
        }
      };
      my.state.set_fun(parse_osc);
    },
    // Privacy Message (PM)
    '^': function() {
      my.state.reset_args();
      my.state.set_fun(parse_until_string_terminator);
    },
    // Application Program Control (APC)
    '_': function() {
      my.state.reset_args();
      my.state.set_fun(parse_until_string_terminator);
    },
    // xterm 'ESC 0x20' Sequence
    '\x20': function() {
      var parse = function() {
        var ch = my.state.consume();
        if(my.warn) {
          factory.log().out('Unimplemented Sequence: ESC 0x20 ' + ch);
        }
        my.state.reset_fun();
      };
      my.state.set_fun(parse);
    },
    // DEC 'ESC #' Sequences
    '#': function() {
      var parse = function() {
        var ch = my.state.consume();
        if(ch === '8') {
          that.emit('fill', 'E');
        }
        else if('3456'.indexOf(ch) === -1) {
          /* Echo to terminal all non reserved sequences */
          that.emit('print', '\x1b#' + ch);
        }
        my.state.reset_fun();
      };
      my.state.set_fun(parse);
    },
    // 'ESC %' Sequences
    '%': function() {
      var parse = function() {
        var ch = my.state.consume();
        if (my.warn) {
          factory.log().out('Unknown/Unimplemented Seuqnce : ESC % ' + ch);
        }
        my.state.reset_fun();
      };
      my.state.set_fun(parse);
    },
    // Back Index (DECBI)
    '6': ignore,
    // Save Cursor (DECSC)
    '7': function() {
      save_cursor();
    },
    // Restore Cursor (DECRC)
    '8': function() {
      restore_cursor();
    },
    // Application Keypad (DECPAM)
    '=': function() {
      that.emit('set_application_keypad', true);
    },
    // Normal Keypad (DECPNM)
    '>': function() {
      that.emit('set_application_keypad', false);
    },
    // Cursor to Lower Left (xterm only)
    'F': ignore,
    // Full Reset (RIS)
    'c': function() {
      reset()
      that.emit('reset');
    },
    // Memory Lock / Unlock
    'l': ignore,
    'm': ignore,
    // Lock Shift 2 (LS2)
    'n': function() {
      my.GL = 'G2';
    },
    // Lock Shift 3 (LS3)
    'o': function() {
      my.GL = 'G3';
    },
    // Lock Shift 3, Right (LS3R)
    '|': function() {
      my.GR = 'G3';
    },
    // Lock Shift 2, Right (LS2R)
    '}': function() {
      my.GR = 'G1';
    },
    // Lock Shift 1, Right (LS1R)
    '~': function() {
      my.GR = 'G1';
    },
  };
  //
  // Character Set Selection (SCS) 
  //
  my.ESC['('] =
  my.ESC[')'] =
  my.ESC['*'] =
  my.ESC['+'] =
  my.ESC['-'] =
  my.ESC['.'] =
  my.ESC['/'] = function(code) {
    var parse = function() {
      var ch = my.state.consume();
      if(ch === '\x1b') {
        my.state.reset_fun();
        my.state.fun()();
        return;
      }
      if(ch in require('./char_map.js').maps) {
        if(code === '(') {
          my.G0 = require('./char_map.js').maps[ch];
        }
        else if(code ===')' || code === '-') {
          my.G1 = require('./char_map.js').maps[ch];
        }
        else if(code ==='*' || code === '.') {
          my.G2 = require('./char_map.js').maps[ch];
        }
        else if(code ==='+' || code === '/') {
          my.G3 = require('./char_map.js').maps[ch];
        }
      }
      else if(my.warn) {
        factory.log().out('Invalid Character Set: ' + ch + 
                          ' for code: ' + code);
      }
      my.state.reset_fun();
    };
    my.state.set_fun(parse);
  };

  //
  // ### OSC
  // Collection of OSC (Operating System Control) sequences.
  //
  my.OSC = {
    // Change Icon Name and Window Title
    '0': function() {
      that.emit('set_window_title', my.state.args()[0]);
    },
    // Change Window Title
    '2': function() {
      that.emit('set_window_title', my.state.args()[0]);
    },
    // Set/Read Color Palette
    '4': ignore,
    // Set/Read System Clipboard
    '52': function() {
      var args_r = /^[cps01234567]+;(.*)$/;
      var args_m = my.state.args()[0].match(args_r);
      if(!args_m)
        return;
      var data = new Buffer(args_m[1], 'base64').toString('utf8') 
      if(data && data.length > 0)
        that.emit('copy_to_clipboard', data);
    }
  };

  //
  // ### CSI
  // Collection of CSI (Control Sequence Introducer) sequences.
  //
  my.CSI = {
    // Insert (blank) characters (ICH)
    '@': function() {
      that.emit('insert_chars', my.state.int_arg(0, 1));
    },
    // Cursor Up (CUU)
    'A': function() {
      that.emit('cursor_up', my.state.int_arg(0, 1));
    },
    // Cursor Down (CUD)
    'B': function() {
      that.emit('cursor_down', my.state.int_arg(0, 1));
    },
    // Cursor Forward (CUF)
    'C': function() {
      that.emit('cursor_right', my.state.int_arg(0, 1));
    },
    // Cursor Backward (CUB)
    'D': function() {
      that.emit('cursor_left', my.state.int_arg(0, 1));
    },
    // Cursor Next Line (CNL)
    'E': function() {
      that.emit('cursor_down', my.state.int_arg(0, 1));
      that.emit('set_cursor_column', 0);
    },
    // Cursor Preceding Line (CPL)
    'F': function() {
      that.emit('cursor_up', my.state.int_arg(0, 1));
      that.emit('set_cursor_column', 0);
    },
    // Cursor Character Absolute (CHA)
    'G': function() {
      that.emit('set_cursor_column', my.state.int_arg(0, 1) - 1);
    },
    // Cursor Position (CUP)
    'H': function() {
      that.emit('set_cursor_position', 
                my.state.int_arg(0, 1) - 1,
                my.state.int_arg(1, 1) - 1);
    },
    // Cursor Forward Tabulation (CHT)
    'I': function() {
      var count = my.state.int_arg(0, 1);
      /* Overflow is checked by `term` (see clamp in `next_stop`) */
      that.emit('forward_tab_stop', count);
    },
    // Erase in Display (ED, DECSED)
    'J': function(code) {
      var arg = my.state.args()[0];

      if(!arg || arg === '0') {
        that.emit('erase_below');
      }
      else if(arg === '1') {
        that.emit('erase_above');
      }
      else if(arg === '2') {
        that.emit('clear');
      }
      else if(arg === '3') {
        /* xterm "Erase saved lines" -> clear */
        that.emit('clear');
      }
      else {
        that.emit('print', '\x1b[' + code + args[0]);
      }
    },
    // Erase in Line (EL, DECSEL)
    'K': function(code) {
      var arg = my.state.args()[0];

      if(!arg || arg === '0') {
        that.emit('erase_right');
      }
      else if(arg === '1') {
        that.emit('erase_left');
      }
      else if(arg === '2') {
        that.emit('erase_line');
      }
      else {
        that.emit('print', '\x1b[' + code + args[0]);
      }
    },
    // Insert Lines (IL)
    'L': function() {
      that.emit('insert_lines', my.state.int_arg(0, 1));
    },
    // Delete Lines (DL)
    'M': function() {
      that.emit('delete_lines', my.state.int_arg(0, 1));
    },
    // Delete Characters (DCH)
    'P': function() {
      that.emit('delete_chars', my.state.int_arg(0, 1));
    },
    // Scroll Up (SU)
    'S': function() {
      that.emit('scroll_up', my.state.int_arg(0, 1));
    },
    // Scroll Down (SD)
    'T': function() {
      if(my.state.args().length <= 1)
        that.emit('scroll_down', my.state.int_arg(0, 1));
    },
    // Reset Title Mode Features
    '>T': ignore,
    // Erase Characters (ECH)
    'X': function() {
      that.emit('erase_right', my.state.int_arg(0, 1))
    },
    // Cursor Bakcward Tabulation (CBT)
    'Z': function() {
      var count = my.state.int_arg(0, 1);
      /* Overflow is checked by `term` (see clamp in `prev_stop`) */
      that.emit('backward_tab_stop', count);
    },
    // Character Position Absolute (HPA)
    '`': function() {
      that.emit('set_cursor_column', my.state.int_arg(0, 1) - 1);
    },
    // Repeat Graphic Character
    'b': ignore,
    // Send Device Attribute (Primary DA)
    'c': function() {
      /* Hard coded to VT100. Upgradable to VT200 w/ implementation */
      if(!my.state.args()[0] || my.state.args()[0] === '0') {
        that.emit('write', '\x1b[?1;2c');
      }
    },
    // Send Device Attribute (Secondary DA)
    '>c': function() {
      that.emit('write', '\x1b[>0;256;0c');
    },
    // Line Position Absolute (VPA)
    'd': function() {
      that.emit('set_cursor_row', my.state.int_arg(0, 1) - 1);
    },
    // Tab Clear (TBC)
    'g': function() {
      if(!my.state.args()[0] || my.state.args()[0] === '0') {
        that.emit('clear_tab_stop');
      }
      else if(my.state.args()[0] === '3') {
        that.emit('clear_all_tab_stops');
      }
    },
    // Set Mode (SM)
    'h': function() {
      for(var i = 0; i < my.state.args().length; i ++) {
        set_ansi_mode(my.state.args()[i], true);
      }
    },
    // DEC Private Mode Set (DECSET)
    '?h': function() {
      for(var i = 0; i < my.state.args().length; i ++) {
        set_dec_mode(my.state.args()[i], true);
      }
    },
    // Media Copy (MC)
    'i': ignore,
    // Media Copy (MC, DEC Specific)
    '?i': ignore,
    // Reset Mode (RM)
    'l': function() {
      for(var i = 0; i < my.state.args().length; i ++) {
        set_ansi_mode(my.state.args()[i], false);
      }
    },
    // DEC Private Mode Reset (DECRST)
    '?l': function() {
      for(var i = 0; i < my.state.args().length; i ++) {
        set_dec_mode(my.state.args()[i], false);
      }
    },
    // Character Attributes (SGR)
    // Iterate through the list of arguments, applying the following attribute
    // changes based on the argument value...
    //
    //   0 Normal (default).
    //   1 Bold.
    //   4 Underlined.
    //   5 Blink (appears as Bold).
    //   7 Reverse.
    //   8 Invisible, i.e., hidden (VT300).
    //  22 Normal (neither bold nor faint).
    //  24 Not underlined.
    //  25 Steady (not blinking).
    //  27 Positive (not reverse).
    //  28 Visible, i.e., not hidden (VT300).
    //  30 Set foreground color to Black.
    //  31 Set foreground color to Red.
    //  32 Set foreground color to Green.
    //  33 Set foreground color to Yellow.
    //  34 Set foreground color to Blue.
    //  35 Set foreground color to Magenta.
    //  36 Set foreground color to Cyan.
    //  37 Set foreground color to White.
    //  39 Set foreground color to default (original).
    //  40 Set background color to Black.
    //  41 Set background color to Red.
    //  42 Set background color to Green.
    //  43 Set background color to Yellow.
    //  44 Set background color to Blue.
    //  45 Set background color to Magenta.
    //  46 Set background color to Cyan.
    //  47 Set background color to White.
    //  49 Set background color to default (original)
    //
    // For 16-color support, the following apply.
    //
    //  90 Set foreground color to Bright Black.
    //  91 Set foreground color to Bright Red.
    //  92 Set foreground color to Bright Green.
    //  93 Set foreground color to Bright Yellow.
    //  94 Set foreground color to Bright Blue.
    //  95 Set foreground color to Bright Magenta.
    //  96 Set foreground color to Bright Cyan.
    //  97 Set foreground color to Bright White.
    // 100 Set background color to Bright Black.
    // 101 Set background color to Bright Red.
    // 102 Set background color to Bright Green.
    // 103 Set background color to Bright Yellow.
    // 104 Set background color to Bright Blue.
    // 105 Set background color to Bright Magenta.
    // 106 Set background color to Bright Cyan.
    // 107 Set background color to Bright White.
    //
    // For 88- or 256-color support, the following apply.
    //  38 ; 5 ; P Set foreground color to P.
    //  48 ; 5 ; P Set background color to P.
    'm': function() {
      var get256 = function(i) {
        if(my.state.args().length < i + 2 || my.state.args()[i + 1] !== '5')
          return null;
        return my.state.int_arg(i + 2, 0);
      };

      if(!my.state.args().length) {
        that.emit('char_attr_reset');
        return;
      }
      for (var i = 0; i < my.state.args().length; i++) {
        var arg = my.state.int_arg(i, 0);

        if(arg < 30) {
          if(arg === 0)
            that.emit('char_attr_reset');
          if(arg === 1)
            that.emit('char_attr_set_bold', true);
          if(arg === 3)
            that.emit('char_attr_set_italic', true);
          if(arg === 4)
            that.emit('char_attr_set_underline', true);
          if(arg === 5)
            that.emit('char_attr_set_blink', true);
          if(arg === 7)
            that.emit('char_attr_set_reverse', true);
          if(arg === 8)
            that.emit('char_attr_set_invisible', true);
          if(arg === 21 || arg === 22)
            that.emit('char_attr_set_bold', false);
          if(arg === 23)
            that.emit('char_attr_set_italic', false);
          if(arg === 24)
            that.emit('char_attr_set_underline', false);
          if(arg === 25)
            that.emit('char_attr_set_blink', false);
          if(arg === 27)
            that.emit('char_attr_set_reverse', false);
          if(arg === 28)
            that.emit('char_attr_set_invisible', false);
        }
        else if(arg < 50) {
          /* foreground */
          if(arg < 38) {
            that.emit('char_attr_set_foreground_index', arg - 30);
          }
          else if(arg === 38) {
            var c = get256(i);
            if(c === null) break;
            i+= 2;
            that.emit('char_attr_set_foreground_index', c);
          }
          else if(arg === 39) {
            that.emit('char_attr_set_foreground_index', null);
          }
          /* background */
          else if(arg < 48) {
            that.emit('char_attr_set_background_index', arg - 40);
          }
          else if(arg === 48) {
            var c = get256(i);
            if(c === null) break;
            i+= 2;
            that.emit('char_attr_set_background_index', c);
          }
          else if(arg === 49) {
            that.emit('char_attr_set_background_index', null);
          }
        }
        else if(arg >= 90 && arg <= 97) {
          that.emit('char_attr_set_foreground_index', arg - 90 + 8);
        }
        else if(arg >= 100 && arg <= 107) {
          that.emit('char_attr_set_background_index', arg - 100 + 8);
        }
      }
      /* TODO: set default value for term char attrs  */
      /* attrs.setDefaults(term.getForegroundColor(), */
      /*                   term.getBackgroundColor()) */
    },
    // Set xterm-specific Keyboard Modes
    '>m': ignore,
    // Device Status Report (DSR, DEC Specific)
    'n': function() {
      if(my.state.args()[0] === '5') {
        that.emit('write', '\x1b0n');
      }
      else if(my.parse_state.args()[0] === '6') {
        that.emit('report_cursor_position');
      }
    },
    // Disable xterm-specific Keyboard Modes
    '>n': ignore,
    // Device Status Report (DSR, DEC Specific)
    '?n': function() {
      if(my.state.args()[0] === '6') {
        that.emit('report_cursor_position');
      }
      else if(my.state.args()[0] === '15') {
        that.emit('write', '\x1b[?11n');
      }
      else if(my.state.args()[0] === '25') {
        that.emit('write', '\x1b[?21n');
      }
      else if(my.state.args()[0] === '26') {
        that.emit('write', '\x1b[?12;1;0;0n');
      }
      else if(my.state.args()[0] === '53') {
        that.emit('write', '\x1b[?50n');
      }
    },
    // Hide Pointer
    '>p': ignore,
    // Soft Terminal Reset (DECSTR)
    '!p': function() {
      reset();
      that.emit('soft_reset');
    },
    // Request ANSI Mode (DECRQM)
    '$p': ignore,
    '?$p': ignore,
    // Set Performance Level (DECSCL)
    '"p': ignore,
    // Load LEDs (DECLL)
    'q': ignore,
    // Set Cursor Style (DECSCUSR, VT520)
    ' q': ignore,
    // Select Character Protection Attribute (DECSCA)
    '"q': ignore,
    // Set Scrolling Region (DECSTBM)
    'r': function() {
      var args = my.state.args();
      var scroll_top = args[0] ? parseInt(args[0], 10) - 1 : null;
      var scroll_bottom = args[1] ? parseInt(args[1], 10) - 1 : null;
      that.emit('set_scroll_region', scroll_top, scroll_bottom);
      that.emit('set_cursor_position', 0, 0);
    },
    // Restore DEC Private Mode Values
    '?r': ignore,
    // Change Attributes in Rectangular Area (DECCARA)
    '$r': ignore,
    // Save Cursor (ANSI.SYS)
    's': function() {
      save_cursor();
    },
    // Save DEC Private Mode Values
    '?s': ignore,
    // Window Manipulation (from dtterm)
    't': ignore,
    // Reverse Attributes in Rectangular Area (DECRARA)
    '$t': ignore,
    // Set one or more Features of the Title Modes
    '>t': ignore,
    // Set Warning-Bell Volume (DECSWBV, VT520)
    ' t': ignore,
    // Restore Cursor (ANSI.SYS)
    'u': function() {
      restore_cursor();
    },
    // Copy Rectangular Area (DECCRA, VT400)
    '$v': ignore,
    // Enable Filter Rectangle (DECEFR)
    '\'w': ignore,
    // Request Terminal Parameters (DECREQTPARM)
    'x': ignore,
    // Select Attribute Change Extent (DECSACE)
    '*x': ignore,
    // Fill Rectangular Area (DECFRA, VT420)
    '$x': ignore,
    // Enable Locator Reporting (DECELR)
    '\'z': ignore,
    // Erase Rectangular Area (DECERA, VT400)
    '$z': ignore,
    // Select Locator Events (DECSLE)
    '\'{': ignore,
    // Request Locator Position (DECRQLP)
    '\'|': ignore,
    // Insert Columns (DECIC, VT420)
    ' }': ignore,
    // Delete P s Columns (DECDC, VT420)
    ' ~': ignore
  };
  //
  // Aliases
  //
  my.CSI['?J'] = my.CSI['J'];
  my.CSI['?K'] = my.CSI['K'];
  // Horizontal and Vertical Position (HVP)
  my.CSI['f'] = my.CSI['H'];

  //
  // ### VT52 sequences
  // Collection of VT52 sequences.
  //
  my.VT52 = {
    // ...
  };

  //
  // #### _initialization_
  //
  reset();

  common.getter(that, 'G0', my, 'G0');
  common.setter(that, 'G0', my, 'G0');
  common.getter(that, 'G1', my, 'G1');
  common.setter(that, 'G1', my, 'G1');
  common.getter(that, 'G2', my, 'G2');
  common.setter(that, 'G2', my, 'G2');
  common.getter(that, 'G3', my, 'G3');
  common.setter(that, 'G3', my, 'G3');

  common.getter(that, 'GR', my, 'GR');
  common.setter(that, 'GR', my, 'GR');
  common.getter(that, 'GL', my, 'GL');
  common.setter(that, 'GL', my, 'GL');

  common.method(that, 'read', read, _super);
  common.method(that, 'reset', reset, _super);

  return that;
};

exports.vt = vt;

