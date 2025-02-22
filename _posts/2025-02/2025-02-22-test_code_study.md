---
layout: post
title: 테스트 코드를 왜 해야하는가
author: haeran
date: 2025-02-21 21:07:00 +0900
categories: [Study]
banner:
  image: https://tech.inflab.com/static/7ce1995567e2a9099ff63acc47ff86e4/37523/believe.png
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Study, Test_code]
---

## 테스트 코드란 무엇인가? [**(link)**](https://www.notion.so/14a4c3eb052f4c9fa6bec97097c0a2b7?pvs=21)


테스트 코드는 소프트웨어의 기능을 (자동으로) **검증**하는 코드이다.   
주어진 입력에 대해 **기대되는 출력**을 확인하여 오류를 조기에 발견할 수 있다.   
일반적으로 단위 테스트, 통합 테스트, E2E(End-to-End) 테스트 등 다양한 유형이 있다.

### 용법

[Vitest 주요 메서드 정리](https://www.notion.so/Vitest-19e883e8feef806394e2e28db70e1c86?pvs=21)

[Playwright 사용법 및 메서드 정리](https://www.notion.so/Playwright-19e883e8feef800d91c0cadb65a0ae46?pvs=21)

[Api 대신 Mock 사용하기](https://www.notion.so/Api-Mock-1a0883e8feef80fdbc57dff1e15be3de?pvs=21)

### Mocking 원리 [(link)](https://www.notion.so/Mocking-f2efe71ab57c4c6d878e4b62e8c0109a?pvs=21)

#### **mocking 이란?**

( mock = 모조품, 가짜 ) 뜻 그대로 받아들이면 된다.   
테스트하고자 하는 코드가 의존하는 function 이나 class에 대해 모조품을 만들어 ‘일단’ 돌아가게 하는 것이다.

> **왜 가짜로 대체하는가?**   
테스트 하고싶은 기능이 다른 기능들과 엮여있을 경우 (의존) 정확한 테스트를 하기 힘들기 때문이다.   
실제 데이터베이스에 데이터를 넣는 방식으로 테스트를 할 경우, 트랜잭션이 일어나기에 IO 시간도 테스트에 포함되고, 데이터베이스 연결 상태에 따라 테스트가 실패 할 수도 있기 때문이다.   
또, 테스트가 실패했을 경우 내가 작성한 컨트롤러 코드의 문제인지, 데이터베이스의 문제인지 알아차리기도 힘들기 때문에 올바른 단위테스트라고 할 수 없다.

![Untitled](https://file.notion.so/f/f/1e33c9be-7fc7-4d9b-bd09-cde89805af4c/a25b1ad3-c9e5-48f9-a080-0f6cc7c9f4f0/Untitled.png?table=block&id=1a0883e8-feef-8077-a478-e29f2cb9350d&spaceId=1e33c9be-7fc7-4d9b-bd09-cde89805af4c&expirationTimestamp=1740124800000&signature=gMq08t4Q-MN62JQqQWfuX7KL9qwLUojlWXzMpaNz_pM&downloadName=Untitled.png)

### 테스트 코드에도 라이프 사이클이 있다?

테스트 코드도 실행 전후에 특정 작업을 수행하는 라이프 사이클이 있다.

예를 들어, `beforeEach`와 `afterEach`를 사용해 테스트 실행 전후에 초기화 및 정리 작업을 수행할 수 있다.

일부 테스트 프레임워크에서는 `beforeAll`과 `afterAll`을 제공하여 전체 테스트 실행 전후에 설정할 작업을 정의할 수 있다.

#### `beforeAll`과 `afterAll`과의 차이**

| 기능 | 설명 | 호출 횟수 |
| --- | --- | --- |
| `beforeEach` | 각 테스트 **시작 전** 실행 | 매 테스트마다 실행 |
| `afterEach` | 각 테스트 **완료 후** 실행 | 매 테스트마다 실행 |
| `beforeAll` | 모든 테스트 **시작 전** 실행 | 한 번만 실행 |
| `afterAll` | 모든 테스트 **완료 후** 실행 | 한 번만 실행 |

✅ `beforeAll`과 `afterAll`은 한 번만 실행되므로 **데이터베이스 연결 및 해제** 등에 유용.


### **Vitest & Playwright에서 `beforeEach`와 `afterEach`**

> `beforeEach`와 `afterEach`는 테스트 실행 전후에 특정 작업을 수행하는 데 사용됩니다. 두 개념은 **Vitest**와 **Playwright**에서 공통적으로 사용되지만, 목적과 동작 방식에는 차이가 있습니다.

#### **Vitest에서 `beforeEach`와 `afterEach`**

 - Vitest에서는 테스트가 실행되기 전에 설정(`beforeEach`), 실행 후 정리(`afterEach`)를 수행하는 데 사용하며 **테스트 환경을 초기화하고, 테스트 간 독립성을 유지하는 역할**을 합니다.   
- ✅ **네트워크 요청, DB 연결, 파일 시스템 조작** 등 비동기 작업이 필요할 때 사용.



#### Playwright에서 `beforeEach`와 `afterEach`**

- Playwright에서는 `beforeEach`와 `afterEach`를 사용하여 **브라우저, 페이지, 컨텍스트를 초기화하고 정리**합니다.

#### Playwright + Vitest 조합 사용**

- laywright와 Vitest를 함께 사용하면 강력한 **E2E + 단위 테스트** 환경을 만들 수 있습니다.
- ✅ **Vitest의 `beforeEach` → Playwright의 `beforeEach` 순으로 실행됨**
- ✅ **Vitest의 `afterEach` → Playwright의 `afterEach` 순으로 실행됨**

```ts
import { test, expect } from '@playwright/test';
import { beforeEach, afterEach } from 'vitest';

beforeEach(async () => {
    console.log('Vitest에서 설정 작업 실행');
});

test.beforeEach(async ({ page }) => {
    await page.goto('https://example.com'); // Playwright에서 각 테스트마다 초기화
});

test('Playwright와 Vitest 조합 테스트', async ({ page }) => {
    await expect(page).toHaveTitle(/Example/);
});

afterEach(() => {
    console.log('Vitest에서 정리 작업 실행');
});
```

## **📌 정리**

| 기능 | **Vitest** (단위 테스트) | **Playwright** (E2E 테스트) |
| --- | --- | --- |
| `beforeEach` | 각 테스트 실행 전에 환경 초기화 | 각 테스트 전에 특정 URL로 이동 등 |
| `afterEach` | 각 테스트 실행 후 정리 작업 수행 | 각 테스트 후 세션 종료, 로그 출력 등 |
| `beforeAll` | 모든 테스트 전에 한 번 실행 (예: DB 연결) | 브라우저 컨텍스트 생성 |
| `afterAll` | 모든 테스트 후 한 번 실행 (예: DB 해제) | 브라우저 컨텍스트 정리 |
    
- **✅ `beforeEach`와 `afterEach`는 각 테스트의 독립성을 보장하고 테스트 환경을 유지하는 데 필수적인 기능입니다.**
    
- **✅ Playwright에서는 브라우저 환경을 초기화하는 데 사용되고, Vitest에서는 테스트 데이터를 초기화하는 데 활용됩니다.**