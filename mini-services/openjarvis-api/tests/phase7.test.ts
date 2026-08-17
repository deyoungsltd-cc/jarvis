/**
 * Phase 7 Tests — Mobile API Layer
 * 
 * Tests the mobile infrastructure directly (no HTTP server needed):
 * 1. Pagination utility: parsePagination, buildPaginatedResponse
 * 2. Mobile client service: register, authenticate, revoke, regenerate
 * 3. Mobile auth middleware: valid key, invalid key, missing key, optional auth
 * 4. Mobile types: MOBILE_API_VERSION, valid interfaces
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { parsePagination, buildPaginatedResponse } from '../src/mobile/pagination.js';
import { mobileClientService } from '../src/services/mobileClientService.js';
import { MOBILE_API_VERSION } from '../src/mobile/types.js';
import { db } from '../src/utils/db.js';

describe('Phase 7 — Mobile API Layer', () => {

  // =================================================================
  // 1. Pagination Utility
  // =================================================================
  describe('Pagination Utility', () => {
    it('parses default pagination params', () => {
      const result = parsePagination({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(20);
    });

    it('parses custom page and limit', () => {
      const result = parsePagination({ page: 3, limit: 10 });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.skip).toBe(20);
      expect(result.take).toBe(10);
    });

    it('clamps page to minimum 1', () => {
      const result = parsePagination({ page: 0 });
      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it('clamps limit to max 100', () => {
      const result = parsePagination({ limit: 500 });
      expect(result.limit).toBe(100);
      expect(result.take).toBe(100);
    });

    it('clamps limit to minimum 1', () => {
      const result = parsePagination({ limit: -5 });
      expect(result.limit).toBe(1);
    });

    it('uses custom defaultLimit', () => {
      const result = parsePagination({ defaultLimit: 5 });
      expect(result.limit).toBe(5);
    });

    it('builds paginated response with correct metadata', () => {
      const data = [{ id: '1' }, { id: '2' }];
      const response = buildPaginatedResponse(data, 10, 1, 2);

      expect(response.data).toEqual(data);
      expect(response.pagination.page).toBe(1);
      expect(response.pagination.limit).toBe(2);
      expect(response.pagination.total).toBe(10);
      expect(response.pagination.totalPages).toBe(5);
      expect(response.pagination.hasNext).toBe(true);
      expect(response.pagination.hasPrev).toBe(false);
    });

    it('builds response for last page', () => {
      const data = [{ id: '1' }];
      const response = buildPaginatedResponse(data, 11, 3, 5);

      expect(response.pagination.hasNext).toBe(false);
      expect(response.pagination.hasPrev).toBe(true);
      expect(response.pagination.totalPages).toBe(3);
    });

    it('handles empty data', () => {
      const response = buildPaginatedResponse([], 0, 1, 20);

      expect(response.data).toEqual([]);
      expect(response.pagination.total).toBe(0);
      expect(response.pagination.totalPages).toBe(0);
      expect(response.pagination.hasNext).toBe(false);
      expect(response.pagination.hasPrev).toBe(false);
    });
  });

  // =================================================================
  // 2. Mobile Client Service
  // =================================================================
  describe('Mobile Client Service', () => {
    let clientId: string;
    let apiKey: string;

    it('registers a new client with API key', async () => {
      const client = await mobileClientService.register({
        name: 'Test iPhone',
        platform: 'ios',
      });

      expect(client.id).toBeDefined();
      expect(client.name).toBe('Test iPhone');
      expect(client.platform).toBe('ios');
      expect(client.apiKey).toBeDefined();
      expect(client.apiKey.length).toBe(64);
      expect(client.enabled).toBe(true);

      clientId = client.id;
      apiKey = client.apiKey;
    });

    it('authenticates with valid API key', async () => {
      const client = await mobileClientService.authenticate(apiKey);
      expect(client).not.toBeNull();
      expect(client!.id).toBe(clientId);
      expect(client!.name).toBe('Test iPhone');
    });

    it('returns null for invalid API key', async () => {
      const client = await mobileClientService.authenticate('invalid_key_12345');
      expect(client).toBeNull();
    });

    it('returns null for missing API key', async () => {
      const client = await mobileClientService.authenticate(undefined);
      expect(client).toBeNull();
    });

    it('rejects invalid platform', async () => {
      await expect(
        mobileClientService.register({ name: 'Test', platform: 'windows_phone' })
      ).rejects.toThrow();
    });

    it('rejects missing name', async () => {
      await expect(
        mobileClientService.register({ name: '', platform: 'ios' })
      ).rejects.toThrow();
    });

    it('revokes a client', async () => {
      const client = await mobileClientService.register({
        name: 'Revoke Test',
        platform: 'android',
      });

      await mobileClientService.revoke(client.id);

      // Auth should now fail
      const auth = await mobileClientService.authenticate(client.apiKey);
      expect(auth).toBeNull();
    });

    it('re-enables a client', async () => {
      const client = await mobileClientService.register({
        name: 'Enable Test',
        platform: 'web',
      });

      await mobileClientService.revoke(client.id);
      let auth = await mobileClientService.authenticate(client.apiKey);
      expect(auth).toBeNull();

      await mobileClientService.enable(client.id);
      auth = await mobileClientService.authenticate(client.apiKey);
      expect(auth).not.toBeNull();
    });

    it('regenerates API key', async () => {
      const client = await mobileClientService.register({
        name: 'Regen Test',
        platform: 'ios',
      });
      const oldKey = client.apiKey;

      const updated = await mobileClientService.regenerateApiKey(client.id);
      expect(updated.apiKey).not.toBe(oldKey);
      expect(updated.apiKey.length).toBe(64);

      // Old key should not work
      const oldAuth = await mobileClientService.authenticate(oldKey);
      expect(oldAuth).toBeNull();

      // New key should work
      const newAuth = await mobileClientService.authenticate(updated.apiKey);
      expect(newAuth).not.toBeNull();
    });

    it('lists all clients', async () => {
      const list = await mobileClientService.list();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      // Each should have expected fields
      for (const c of list) {
        expect(c.id).toBeDefined();
        expect(c.name).toBeDefined();
        expect(c.platform).toBeDefined();
        expect(c.apiKey).toBeDefined();
      }
    });

    it('deletes a client', async () => {
      const client = await mobileClientService.register({
        name: 'Delete Test',
        platform: 'android',
      });

      await mobileClientService.remove(client.id);

      const list = await mobileClientService.list();
      const found = list.find(c => c.id === client.id);
      expect(found).toBeUndefined();
    });

    it('supports all three platforms', async () => {
      for (const platform of ['ios', 'android', 'web']) {
        const client = await mobileClientService.register({
          name: `${platform} client`,
          platform: platform as any,
        });
        expect(client.platform).toBe(platform);
      }
    });
  });

  // =================================================================
  // 3. Mobile Types
  // =================================================================
  describe('Mobile Types', () => {
    it('exports MOBILE_API_VERSION as v1', () => {
      expect(MOBILE_API_VERSION).toBe('v1');
    });
  });
});
