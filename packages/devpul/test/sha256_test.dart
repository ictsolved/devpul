import 'package:devpul/src/sha256.dart';
import 'package:test/test.dart';

void main() {
  test('matches known digests', () {
    expect(
      sha256Hex(''),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(
      sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(
      sha256Hex('x' * 1000),
      '44f8354494a5ba03ba1792a8d3e9c534c47a9181980fde7a3f44b06ef2ae7c7f',
    );
  });

  test('hashes UTF-8 bytes', () {
    expect(
      sha256Hex('aé€😀'),
      '730aa6be2ae229d36b38e7e0108a448cf38b72b4ee345a37ca3aeb046588b1cb',
    );
  });

  test('pads at block boundaries', () {
    const digests = {
      55: '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318',
      56: 'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
      63: '7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34',
      64: 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
      119: '31eba51c313a5c08226adf18d4a359cfdfd8d2e816b13f4af952f7ea6584dcfb',
    };
    for (final MapEntry(:key, :value) in digests.entries) {
      expect(sha256Hex('a' * key), value, reason: '$key bytes');
    }
  });
}
