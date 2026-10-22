/**
 * tests/build.test.ts: version file
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { formatBuildTime, getBuildFileName, readVersion, versionCurrentBuild } from '../build/version-file';

// test that the fresh build is copied to the build-history directory
describe('move old builds', () => {
  let sandboxDir: string;
  let distDir: string;
  let indexFilePath: string;
  beforeEach(() => {
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-testing'));
    distDir = path.join(sandboxDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    indexFilePath = path.join(distDir, 'index.html');
    fs.writeFileSync(indexFilePath, '<html><body>dummy</body></html>');
  });
  afterEach(() => {
    // Clean up the temp directory after each test
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });
  it('test copy with no existing build-history', () => {
    const oldBuildsDir = path.join(sandboxDir, 'build-history');
    expect(fs.existsSync(oldBuildsDir)).toBe(false);
    const oldIndexContent = fs.readFileSync(indexFilePath, 'utf8');
    const movedFilePath = versionCurrentBuild(indexFilePath, oldBuildsDir, "test.html");
    expect(fs.existsSync(oldBuildsDir)).toBe(true);
    const movedFilePathExpected = path.join(oldBuildsDir, 'test.html');
    expect(fs.existsSync(movedFilePathExpected)).toBe(true);
    expect(movedFilePath).toBe(movedFilePathExpected);
    expect(fs.existsSync(indexFilePath)).toBe(true); // index.html should still exist in dist
    // check that the contents of the moved file are the same as the original index.html
    const movedFileContent = fs.readFileSync(movedFilePath, 'utf8');
    expect(movedFileContent).toBe(oldIndexContent);
    expect(fs.readFileSync(indexFilePath, 'utf8')).toBe(oldIndexContent); // index.html should still have the same content
  });
  it('test throwing error when index.html does not exist', () => {
    const oldBuildsDir = path.join(sandboxDir, 'build-history');
    const nonExistentIndexFilePath = path.join(distDir, 'nonexistent.html');
    expect(() => versionCurrentBuild(nonExistentIndexFilePath, oldBuildsDir, "test.html")).toThrowError();
    // make sure that the build-history directory was not created
    expect(fs.existsSync(oldBuildsDir)).toBe(false);
  });
  it('test copy with existing build-history', () => {
    const oldBuildsDir = path.join(sandboxDir, 'build-history');
    fs.mkdirSync(oldBuildsDir, { recursive: true });
    const existingFilePath = path.join(oldBuildsDir, 'existing.html');
    const testBody = '<html><body>existing</body></html>';
    fs.writeFileSync(existingFilePath, testBody);
    const movedFilePath = versionCurrentBuild(indexFilePath, oldBuildsDir, "test.html");
    expect(fs.existsSync(movedFilePath)).toBe(true);
    // check that the existing file is still there
    expect(fs.existsSync(existingFilePath)).toBe(true);
    expect(fs.readFileSync(existingFilePath, 'utf8')).toBe(testBody);
  });
  it('test no index.html doesn\'t destroy existing build-history', () => {
    const oldBuildsDir = path.join(sandboxDir, 'build-history');
    fs.mkdirSync(oldBuildsDir, { recursive: true });
    const existingFilePath = path.join(oldBuildsDir, 'existing.html');
    const testBody = '<html><body>existing</body></html>';
    fs.writeFileSync(existingFilePath, testBody);
    const nonExistentIndexFilePath = path.join(distDir, 'nonexistent.html');
    expect(() => versionCurrentBuild(nonExistentIndexFilePath, oldBuildsDir, "test.html")).toThrowError();
    // check that the existing file is still there
    expect(fs.existsSync(existingFilePath)).toBe(true);
    expect(fs.readFileSync(existingFilePath, 'utf8')).toBe(testBody);
  });
});

describe('correct build file name', () => {
  const testDate = new Date('2024-06-01T12:34:56Z');
  it('generates correct build file name', () => {
    const version = '1.2.3';
    const expectedFileName = 'build-1.2.3-240601-123456.html';
    const actualFileName = getBuildFileName(version, testDate);
    expect(actualFileName).toBe(expectedFileName);
  });
  it('generates something reasonable when date is not provided', () => {
    const version = '1.2.3';
    const actualFileName = getBuildFileName(version);
    const fileNameRegex = /^build-1\.2\.3-\d{6}-\d{6}\.html$/;
    expect(actualFileName).toMatch(fileNameRegex);
  });
});
describe('footer build time', () => {
  const testDate = new Date('2024-06-01T12:34:56Z');
  it('formats as YY-MM-DD HH:MM UTC', () => {
    expect(formatBuildTime(testDate)).toBe('24-06-01 12:34 UTC');
  });
  it('uses UTC regardless of the local offset', () => {
    expect(formatBuildTime(new Date('2024-06-01T23:30:00-05:00'))).toBe('24-06-02 04:30 UTC');
  });
  it('matches the build-history file name for the same moment', () => {
    const [date, time] = formatBuildTime(testDate).split(' ');
    expect(getBuildFileName('1.2.3', testDate))
      .toBe(`build-1.2.3-${date.replace(/-/g, '')}-${time.replace(':', '')}56.html`);
  });
});

describe('read version from package.json', () => {
  let sandboxDir: string;
  beforeEach(() => {
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-testing'));
  });
  afterEach(() => {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });
  it('returns the version field', () => {
    fs.writeFileSync(path.join(sandboxDir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    expect(readVersion(sandboxDir)).toBe('1.2.3');
  });
  it('falls back to 0.0.0 when there is no version field', () => {
    fs.writeFileSync(path.join(sandboxDir, 'package.json'), JSON.stringify({ name: 'x' }));
    expect(readVersion(sandboxDir)).toBe('0.0.0');
  });
  it('returns null when package.json is missing or invalid', () => {
    expect(readVersion(sandboxDir)).toBeNull();
    fs.writeFileSync(path.join(sandboxDir, 'package.json'), '{ not json');
    expect(readVersion(sandboxDir)).toBeNull();
  });
});
