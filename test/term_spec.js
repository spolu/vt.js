/*
 * breach: term_spec.js
 *
 * Copyright (c) 2013, Stanislas Polu. All rights reserved.
 * (see LICENSE file)
 *
 * @log
 * - 20130517 @spolu    Creation
 */
'use strict';

var events = require('events');

describe('term', function() {
  /****************************************************************************/
  /*                           UTILITY FUNCTIONS                              */
  /****************************************************************************/
  var line_to_string = function(line) {
    var str = '';
    line.forEach(function(glyph) {
      str += glyph[1];
    });
    return str;
  };


  /****************************************************************************/
  /*                             INITIALIZATION                               */
  /****************************************************************************/
  var term, pty;

  beforeEach(function(done) {
    pty = new events.EventEmitter();
    term = require('../index.js').term({
      pty: pty,
      cols: 40,
      rows: 24
    });

    return done();
  });

  /****************************************************************************/
  /*                                CLEAN-UP                                  */
  /****************************************************************************/
  afterEach(function(done) {
    return done();
  });

  /****************************************************************************/
  /*                                  TESTS                                   */
  /****************************************************************************/
  it('should correctly print characters', function(done) {
    term.on('refresh', function() {
      var l = line_to_string(term.buffer()[0]);
      expect(l.length).toEqual(40);
      expect(l.substr(0, 4)).toEqual('test');
      return done();
    });

    pty.emit('data', 'test');
  });


  it('should correctly wrap the line', function(done) {
    term.on('refresh', function() {
      var l0 = line_to_string(term.buffer()[0]);
      var l1 = line_to_string(term.buffer()[1]);
      expect(l0).toEqual('EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE');
      expect(l1.substr(0, 10)).toEqual('EEEEEEEEEE');
      expect(l1.substr(10, 1)).toEqual(' ');
      return done();
    });

    var data = '';
    for(var i = 0; i < 50; i ++) data += 'E';
    pty.emit('data', data);
  });
  

  it('should correctly scroll with scroll_region', function(done) {
    term.on('refresh', function() {
      var l23 = line_to_string(term.buffer()[23]);
      var l24 = line_to_string(term.buffer()[24]);
      expect(l23.substr(0,2)).toEqual('23');
      expect(l24.substr(0,2)).toEqual('24');
      var l29 = line_to_string(term.buffer()[29]);
      var l30 = line_to_string(term.buffer()[30]);
      expect(l29.substr(0,2)).toEqual('29');
      expect(l30.substr(0,2)).toEqual('30');
      return done();
    });

    var data = '';
    for(var i = 0; i < 30; i ++) {
      data += i + '\x0a\x0d';
    }
    data += '\x1b[1;23r';
    data += '\x1b[23;1H';
    data += '29\x0d\x0a30';
    data += '\x1b[1;24r';
    pty.emit('data', data);
  });
});
