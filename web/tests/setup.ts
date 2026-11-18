if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {} as unknown as typeof WebSocket;
}

if (typeof Map.groupBy === 'undefined') {
  Map.groupBy = function <K, V>(
    items: Iterable<V>,
    keySelector: (item: V, index: number) => K,
  ): Map<K, V[]> {
    const map = new Map<K, V[]>();
    let i = 0;
    for (const item of items) {
      const key = keySelector(item, i++);
      const list = map.get(key);
      if (list) {
        list.push(item);
      } else {
        map.set(key, [item]);
      }
    }
    return map;
  };
}
