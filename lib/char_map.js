/**
 * mt: char_map.js
 *
 * Copyright (c) 2013, Stanislas Polu. All rights reserved.
 * (see LICENSE file)
 *
 * @log
 * - 20130410 spolu    fork from hterm
 */
var common = require('./common.js');
var util = require('util');

'use strict';

//
// ## char_map
//
// Character map object.
// ```
// @spec {object} { name, glmap }
// ```
//
var char_map = function(spec, my) {
  var _super = {};
  my = my || {};

  //
  // #### _private members_
  //
  my.name = spec.name;

  //
  // #### _public methods_
  //
  var reset;   /* reset(glmap); */
  var GL;      /* GL(str); */
  var GR;      /* GR(str); */

  var that = {};

  //
  // #### reset
  // Resets a character map with the provided GL mapping. (The GR
  // mapping will be automatically created 
  //
  reset = function(glmap) {
    my.glmap = glmap;

    var glkeys = Object.keys(my.glmap).map(function(key) {
      return '\\x' + common.zpad(key.charCodeAt(0).toString(16));
    });
    var glre = new RegExp('[' + glkeys.join('') + ']', 'g');

    /* Compute the GR mapping.                                    */
    /* This is the same as GL except all keys have their MSB set. */
    my.grmap = {};

    glkeys.forEach(function(glkey) {
      var grkey = String.fromCharCode(glkey.charCodeAt(0) & 0x80);
      my.grmap[grkey] = my.glmap[glkey];
    });

    var grkeys = Object.keys(my.grmap).map(function(key) {
      return '\\x' + common.zpad(key.charCodeAt(0).toString(16), 2);
    });

    var grre = new RegExp('[' + grkeys.join('') + ']', 'g');

    var GL = function(str) {
      return str.replace(glre,
                         function(ch) { return my.glmap[ch] });
    };
    common.method(that, 'GL', GL, _super);

    var GR = function(str) {
      return str.replace(grre,
                         function(ch) { return my.grmap[ch] });
    };
    common.method(that, 'GR', GR, _super);
  };

  //
  // #### _initialization_
  //
  if(spec.glmap)
    reset(spec.glmap);

  common.method(that, 'reset', reset, _super);

  return that;
};

exports.char_map = char_map;


//
// ## maps
//
// Mapping from received to display character, used depending on the active
// VT character set.
//
exports.maps = {};

// 
// ### VT100 Graphic character map.
// http://vt100.net/docs/vt220-rm/table2-4.html
// 
exports.maps['0'] = char_map({
  name: 'graphic', 
  glmap: {
    '\x60':'\u25c6',  // ` -> diamond
    '\x61':'\u2592',  // a -> grey-box
    '\x62':'\u2409',  // b -> h/t
    '\x63':'\u240c',  // c -> f/f
    '\x64':'\u240d',  // d -> c/r
    '\x65':'\u240a',  // e -> l/f
    '\x66':'\u00b0',  // f -> degree
    '\x67':'\u00b1',  // g -> +/-
    '\x68':'\u2424',  // h -> n/l
    '\x69':'\u240b',  // i -> v/t
    '\x6a':'\u2518',  // j -> bottom-right
    '\x6b':'\u2510',  // k -> top-right
    '\x6c':'\u250c',  // l -> top-left
    '\x6d':'\u2514',  // m -> bottom-left
    '\x6e':'\u253c',  // n -> line-cross
    '\x6f':'\u23ba',  // o -> scan1
    '\x70':'\u23bb',  // p -> scan3
    '\x71':'\u2500',  // q -> scan5
    '\x72':'\u23bc',  // r -> scan7
    '\x73':'\u23bd',  // s -> scan9
    '\x74':'\u251c',  // t -> left-tee
    '\x75':'\u2524',  // u -> right-tee
    '\x76':'\u2534',  // v -> bottom-tee
    '\x77':'\u252c',  // w -> top-tee
    '\x78':'\u2502',  // x -> vertical-line
    '\x79':'\u2264',  // y -> less-equal
    '\x7a':'\u2265',  // z -> greater-equal
    '\x7b':'\u03c0',  // { -> pi
    '\x7c':'\u2260',  // | -> not-equal
    '\x7d':'\u00a3',  // } -> british-pound
    '\x7e':'\u00b7',  // ~ -> dot
  }
});

//
// ### British character map.
// http://vt100.net/docs/vt220-rm/table2-5.html
//
exports.maps['A'] = char_map({
  name: 'british', 
  glmap: {
    '\x23': '\u00a3',  // # -> british-pound
  }
});

//
// ### US ASCII map, no changes.
//
exports.maps['B'] = char_map({
  name: 'us', 
  glmap: null
});

//
// ### Dutch character map.
// http://vt100.net/docs/vt220-rm/table2-6.html
//
exports.maps['4'] = char_map({
  name: 'dutch', 
  glmap: {
    '\x23': '\u00a3',  // # -> british-pound

    '\x40': '\u00be',  // @ -> 3/4

    '\x5b': '\u0132',  // [ -> 'ij' ligature (xterm goes with \u00ff?)
    '\x5c': '\u00bd',  // \ -> 1/2
    '\x5d': '\u007c',  // ] -> vertical bar

    '\x7b': '\u00a8',  // { -> two dots
    '\x7c': '\u0066',  // | -> f
    '\x7d': '\u00bc',  // } -> 1/4
    '\x7e': '\u00b4',  // ~ -> acute
  }
});

//
// ### Finnish character map.
// http://vt100.net/docs/vt220-rm/table2-7.html
//
exports.maps['C'] =
  exports.maps['5'] = char_map({
  name: 'finnish', 
  glmap: {
    '\x5b': '\u00c4',  // [ -> 'A' umlaut
    '\x5c': '\u00d6',  // \ -> 'O' umlaut
    '\x5d': '\u00c5',  // ] -> 'A' ring
    '\x5e': '\u00dc',  // ~ -> 'u' umlaut

    '\x60': '\u00e9',  // ` -> 'e' acute

    '\x7b': '\u00e4',  // { -> 'a' umlaut
    '\x7c': '\u00f6',  // | -> 'o' umlaut
    '\x7d': '\u00e5',  // } -> 'a' ring
    '\x7e': '\u00fc',  // ~ -> 'u' umlaut
  }
});

//
// ### French character map.
// http://vt100.net/docs/vt220-rm/table2-8.html
//
exports.maps['R'] = char_map({
  name: 'french', 
  glmap: {
    '\x23': '\u00a3',  // # -> british-pound

    '\x40': '\u00e0',  // @ -> 'a' grave

    '\x5b': '\u00b0',  // [ -> ring
    '\x5c': '\u00e7',  // \ -> 'c' cedilla
    '\x5d': '\u00a7',  // ] -> section symbol (double s)

    '\x7b': '\u00e9',  // { -> 'e' acute
    '\x7c': '\u00f9',  // | -> 'u' grave
    '\x7d': '\u00e8',  // } -> 'e' grave
    '\x7e': '\u00a8',  // ~ -> umlaut
  }
});

//
// ### French Canadian character map.
// http://vt100.net/docs/vt220-rm/table2-9.html
//
exports.maps['Q'] = char_map({
  name: 'french canadian', 
  glnap: {
    '\x40': '\u00e0',  // @ -> 'a' grave

    '\x5b': '\u00e2',  // [ -> 'a' circumflex
    '\x5c': '\u00e7',  // \ -> 'c' cedilla
    '\x5d': '\u00ea',  // ] -> 'e' circumflex
    '\x5e': '\u00ee',  // ^ -> 'i' circumflex

    '\x60': '\u00f4',  // ` -> 'o' circumflex

    '\x7b': '\u00e9',  // { -> 'e' acute
    '\x7c': '\u00f9',  // | -> 'u' grave
    '\x7d': '\u00e8',  // } -> 'e' grave
    '\x7e': '\u00fb',  // ~ -> 'u' circumflex
  }
});

//
// ### German character map.
// http://vt100.net/docs/vt220-rm/table2-10.html
//
exports.maps['K'] = char_map({
  name: 'german', 
  glmap: {
    '\x40': '\u00a7',  // @ -> section symbol (double s)

    '\x5b': '\u00c4',  // [ -> 'A' umlaut
    '\x5c': '\u00d6',  // \ -> 'O' umlaut
    '\x5d': '\u00dc',  // ] -> 'U' umlaut

    '\x7b': '\u00e4',  // { -> 'a' umlaut
    '\x7c': '\u00f6',  // | -> 'o' umlaut
    '\x7d': '\u00fc',  // } -> 'u' umlaut
    '\x7e': '\u00df',  // ~ -> eszett
  }
});

//
// ### Italian character map.
// http://vt100.net/docs/vt220-rm/table2-11.html
//
exports.maps['Y'] = char_map({
  name: 'italian', 
  glmap: {
    '\x23': '\u00a3',  // # -> british-pound

    '\x40': '\u00a7',  // @ -> section symbol (double s)

    '\x5b': '\u00b0',  // [ -> ring
    '\x5c': '\u00e7',  // \ -> 'c' cedilla
    '\x5d': '\u00e9',  // ] -> 'e' acute

    '\x60': '\u00f9',  // ` -> 'u' grave

    '\x7b': '\u00e0',  // { -> 'a' grave
    '\x7c': '\u00f2',  // | -> 'o' grave
    '\x7d': '\u00e8',  // } -> 'e' grave
    '\x7e': '\u00ec',  // ~ -> 'i' grave
  }
});

//
// ### Norwegian/Danish character map.
// http://vt100.net/docs/vt220-rm/table2-12.html
//
exports.maps['E'] =
exports.maps['6'] = char_map({
  name: 'norwegian/danish', 
  glmap: {
    '\x40': '\u00c4',  // @ -> 'A' umlaut

    '\x5b': '\u00c6',  // [ -> 'AE' ligature
    '\x5c': '\u00d8',  // \ -> 'O' stroke
    '\x5d': '\u00c5',  // ] -> 'A' ring
    '\x5e': '\u00dc',  // ^ -> 'U' umlaut

    '\x60': '\u00e4',  // ` -> 'a' umlaut

    '\x7b': '\u00e6',  // { -> 'ae' ligature
    '\x7c': '\u00f8',  // | -> 'o' stroke
    '\x7d': '\u00e5',  // } -> 'a' ring
    '\x7e': '\u00fc',  // ~ -> 'u' umlaut
  }
});

//
// ### Spanish character map.
// http://vt100.net/docs/vt220-rm/table2-13.html
//
exports.maps['Z'] = char_map({
  name: 'spanish', 
  glmap: {
    '\x23': '\u00a3',  // # -> british-pound

    '\x40': '\u00a7',  // @ -> section symbol (double s)

    '\x5b': '\u00a1',  // [ -> '!' inverted
    '\x5c': '\u00d1',  // \ -> 'N' tilde
    '\x5d': '\u00bf',  // ] -> '?' inverted

    '\x7b': '\u00b0',  // { -> ring
    '\x7c': '\u00f1',  // | -> 'n' tilde
    '\x7d': '\u00e7',  // } -> 'c' cedilla
  }
});

//
// ### Swedish character map.
// http://vt100.net/docs/vt220-rm/table2-14.html
//
exports.maps['7'] =
exports.maps['H'] = char_map({
  name: 'swedish', 
  glmap: {
    '\x40': '\u00c9',  // @ -> 'E' acute

    '\x5b': '\u00c4',  // [ -> 'A' umlaut
    '\x5c': '\u00d6',  // \ -> 'O' umlaut
    '\x5d': '\u00c5',  // ] -> 'A' ring
    '\x5e': '\u00dc',  // ^ -> 'U' umlaut

    '\x60': '\u00e9',  // ` -> 'e' acute

    '\x7b': '\u00e4',  // { -> 'a' umlaut
    '\x7c': '\u00f6',  // | -> 'o' umlaut
    '\x7d': '\u00e5',  // } -> 'a' ring
    '\x7e': '\u00fc',  // ~ -> 'u' umlaut
  }
});

//
// ### Swiss character map.
// http://vt100.net/docs/vt220-rm/table2-15.html
//
exports.maps['='] = char_map({
  name: 'swiss', 
  glmap: {
    '\x23': '\u00f9',  // # -> 'u' grave

    '\x40': '\u00e0',  // @ -> 'a' grave

    '\x5b': '\u00e9',  // [ -> 'e' acute
    '\x5c': '\u00e7',  // \ -> 'c' cedilla
    '\x5d': '\u00ea',  // ] -> 'e' circumflex
    '\x5e': '\u00ee',  // ^ -> 'i' circumflex
    '\x5f': '\u00e8',  // _ -> 'e' grave

    '\x60': '\u00f4',  // ` -> 'o' circumflex

    '\x7b': '\u00e4',  // { -> 'a' umlaut
    '\x7c': '\u00f6',  // | -> 'o' umlaut
    '\x7d': '\u00fc',  // } -> 'u' umlaut
    '\x7e': '\u00fb',  // ~ -> 'u' circumflex
  }
});

