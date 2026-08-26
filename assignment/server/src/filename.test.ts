import assert from 'node:assert/strict';
import { studentDownloadFilename } from './filename';

assert.equal(studentDownloadFilename(3, 9, 35, '홍길동', '코드.cpp'), '30935홍길동_코드.cpp');
assert.equal(studentDownloadFilename(2, 1, 7, '김 민수', '과제/답.txt'), '20107김민수_과제_답.txt');
