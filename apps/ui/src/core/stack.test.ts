import { describe, expect, it } from 'vitest';
import { foldStack, stackLines } from './stack';

const linked = (stack: string) =>
  stackLines(stack).map((l) => l.frame && { text: l.text.slice(l.frame.start, l.frame.end), ...l.frame.location });

describe('stackLines', () => {
  it('reads VM frames', () => {
    const stack = [
      '#0      Cart.add (package:shop/cart.dart:12:5)',
      '#1      main.<anonymous closure> (file:///home/me/shop/lib/main.dart:30:7)',
      '#2      _rootRun (dart:async/zone.dart:1525:13)',
      '<asynchronous suspension>',
      '#3      build (package:shop/page.dart:8)',
      '#4      run (file:///C:/src/shop/lib/run.dart:4:1)',
    ].join('\n');
    expect(linked(stack)).toEqual([
      { text: 'package:shop/cart.dart:12:5', file: 'package:shop/cart.dart', line: 12, column: 5 },
      {
        text: 'file:///home/me/shop/lib/main.dart:30:7',
        file: 'file:///home/me/shop/lib/main.dart',
        line: 30,
        column: 7,
      },
      undefined,
      undefined,
      { text: 'package:shop/page.dart:8', file: 'package:shop/page.dart', line: 8 },
      { text: 'file:///C:/src/shop/lib/run.dart:4:1', file: 'file:///C:/src/shop/lib/run.dart', line: 4, column: 1 },
    ]);
  });

  it('reads web frames', () => {
    const stack = [
      'dart-sdk/lib/_internal/js_dev_runtime/private/ddc_runtime/errors.dart 274:3  throw_',
      'package:shop/main.dart 14:7                                              build',
      'package:flutter/src/widgets/framework.dart 5902:22                           build',
      'web_entrypoint.dart 24:31                                                         <fn>',
      'package:shop/cart.dart 9   add',
      'package:shop/cart.dart',
    ].join('\n');
    expect(linked(stack)).toEqual([
      undefined,
      { text: 'package:shop/main.dart 14:7', file: 'package:shop/main.dart', line: 14, column: 7 },
      {
        text: 'package:flutter/src/widgets/framework.dart 5902:22',
        file: 'package:flutter/src/widgets/framework.dart',
        line: 5902,
        column: 22,
      },
      undefined,
      { text: 'package:shop/cart.dart 9', file: 'package:shop/cart.dart', line: 9 },
      undefined,
    ]);
  });

  it('leaves other lines as text', () => {
    const lines = stackLines('Error: boom\n    at Object.throw_ (http://localhost:1234/main.dart.js:5:9)\n');
    expect(lines.map((l) => l.text)).toEqual([
      'Error: boom',
      '    at Object.throw_ (http://localhost:1234/main.dart.js:5:9)',
      '',
    ]);
    expect(lines.some((l) => l.frame)).toBe(false);
  });
});

const parts = (stack: string, head = 0) =>
  foldStack(stackLines(stack), 3, head).map((p) => (p.folded ? p.lines.length : p.lines.map((l) => l.text)));

describe('foldStack', () => {
  it('folds runs of framework frames and keeps app frames and short runs', () => {
    const stack = [
      '#0      Cart.add (package:shop/cart.dart:12:5)',
      '#1      _InkResponseState.handleTap (package:flutter/src/material/ink_well.dart:1224:21)',
      '#2      GestureRecognizer.invokeCallback (package:flutter/src/gestures/recognizer.dart:362:24)',
      '<asynchronous suspension>',
      '#3      _rootRun (dart:async/zone.dart:1525:13)',
      '<asynchronous suspension>',
      '#4      build (package:shop/page.dart:8)',
      '#5      _rootRun (dart:async/zone.dart:1525:13)',
    ].join('\n');
    expect(parts(stack)).toEqual([
      ['#0      Cart.add (package:shop/cart.dart:12:5)'],
      4,
      [
        '<asynchronous suspension>',
        '#4      build (package:shop/page.dart:8)',
        '#5      _rootRun (dart:async/zone.dart:1525:13)',
      ],
    ]);
  });

  it('shows the first lines whatever they are', () => {
    const stack = [
      'dart:async 1:1  a',
      'dart:async 2:1  b',
      'dart:async 3:1  c',
      'dart:async 4:1  d',
      'dart:async 5:1  e',
    ];
    expect(parts(stack.join('\n'), 2)).toEqual([stack.slice(0, 2), 3]);
  });

  it('folds web frames', () => {
    const stack = [
      'package:shop/cart.dart 12:5   add',
      'dart:async 1:1  run',
      'dart:async 2:1  run',
      'dart:async 3:1  run',
    ];
    expect(parts(stack.join('\n'))).toEqual([['package:shop/cart.dart 12:5   add'], 3]);
  });
});
