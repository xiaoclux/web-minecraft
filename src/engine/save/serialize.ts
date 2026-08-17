/** 对方块数组做 RLE 压缩：[count, id, count, id, ...]。 */
export function rleEncode(data: Uint8Array): Uint32Array {
  // 先数出有多少段，直接分配定长输出，避免 number[] 增长再整体拷贝
  let runs = 0;
  for (let i = 0; i < data.length; ) {
    const value = data[i];
    let j = i + 1;
    while (j < data.length && data[j] === value) {
      j++;
    }
    runs++;
    i = j;
  }
  const out = new Uint32Array(runs * 2);
  let n = 0;
  for (let i = 0; i < data.length; ) {
    const value = data[i];
    let j = i + 1;
    while (j < data.length && data[j] === value) {
      j++;
    }
    out[n++] = j - i;
    out[n++] = value;
    i = j;
  }
  return out;
}

/** RLE 解压到指定长度。 */
export function rleDecode(encoded: Uint32Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let pos = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    const run = encoded[i];
    const value = encoded[i + 1];
    if (pos + run > length) {
      throw new Error(`rleDecode: data overflow at ${pos} + ${run} > ${length}`);
    }
    out.fill(value, pos, pos + run);
    pos += run;
  }
  if (pos !== length) {
    throw new Error(`rleDecode: decoded ${pos} bytes, expected ${length}`);
  }
  return out;
}

/** RLE 解压，长度由数据本身决定（各段长度之和）。 */
export function rleDecodeAuto(encoded: Uint32Array): Uint8Array {
  let length = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    length += encoded[i];
  }
  return rleDecode(encoded, length);
}
