import { describe, it, expect } from 'vitest';
import { LRUCache, RadialLUTCache } from '../../src/utils/cache';

describe('Cache Utilities', () => {
  describe('LRUCache', () => {
    it('should store and retrieve values', () => {
      const cache = new LRUCache<string, number>(3);
      
      cache.set('a', 1);
      cache.set('b', 2);
      
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBeUndefined();
    });

    it('should evict least recently used items when full', () => {
      const cache = new LRUCache<string, number>(2);
      
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // Should evict 'a'
      
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('should update LRU order on access', () => {
      const cache = new LRUCache<string, number>(2);
      
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // Make 'a' most recently used
      cache.set('c', 3); // Should evict 'b' instead of 'a'
      
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
    });

    it('should check if key exists', () => {
      const cache = new LRUCache<string, number>(2);
      
      cache.set('a', 1);
      
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('should clear all items', () => {
      const cache = new LRUCache<string, number>(2);
      
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
    });
  });

  describe('RadialLUTCache', () => {
    it('should generate correct cache keys', () => {
      const cache = new RadialLUTCache();
      
      expect(cache.getKey(1, 0)).toBe('1_0');
      expect(cache.getKey(2, 1)).toBe('2_1');
      expect(cache.getKey(3, 2)).toBe('3_2');
    });

    it('should check existence with quantum numbers', () => {
      const cache = new RadialLUTCache();
      
      expect(cache.has(1, 0)).toBe(false);
    });
  });
});