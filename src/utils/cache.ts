import * as THREE from 'three';

export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class RadialLUTCache {
  private cache = new LRUCache<string, THREE.DataTexture>(20);

  getKey(n: number, l: number): string {
    return `${n}_${l}`;
  }

  get(n: number, l: number): THREE.DataTexture | undefined {
    return this.cache.get(this.getKey(n, l));
  }

  set(n: number, l: number, texture: THREE.DataTexture): void {
    this.cache.set(this.getKey(n, l), texture);
  }

  has(n: number, l: number): boolean {
    return this.cache.has(this.getKey(n, l));
  }

  clear(): void {
    this.cache.clear();
  }
}