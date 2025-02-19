---
layout: post
title: Promises API, Callback API, Synchronous API
author: haeran
date: 2025-01-09 21:07:00 +0900
categories: [Study, JavaScript]
banner:
  image: https://miro.medium.com/v2/resize:fit:1400/1*GBYrl80IomLGFmQmT8FVcg.png
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [JavaScript]
---

## 1. Promises API

### 설명

Promises는 비동기 작업을 관리하기 위한 JavaScript 객체입니다. 비동기 작업이 성공(success)하거나 실패(fail)했을 때 특정 동작을 실행할 수 있게 해줍니다.

### 장점

- **가독성 향상**: `then`, `catch`, `finally`를 사용하여 코드를 더 직관적으로 작성 가능.
- **에러 처리 용이**: 체이닝에서 발생한 에러를 한곳에서 처리 가능.
- **콜백 지옥 해결**: 콜백 중첩 없이 연속적인 작업 가능.

### 단점

- **복잡한 로직에서 제한**: 복잡한 흐름 제어는 여전히 어렵고 가독성이 저하될 수 있음.

### 예시

```javascript
const fetchData = new Promise((resolve, reject) => {
  setTimeout(() => resolve('Data fetched'), 1000);
});

fetchData
  .then(data => console.log(data)) // 성공 시 실행
  .catch(error => console.error(error)) // 실패 시 실행
  .finally(() => console.log('Operation complete')); // 항상 실행
```

---

## 2. Callback API

### 설명

Callback은 특정 작업이 완료되었을 때 실행되는 함수를 전달하여 비동기 작업을 처리하는 방식입니다.

### 장점

- **간단한 구현**: 초기 학습 곡선이 낮음.
- **유연성**: 다양한 상황에서 사용할 수 있음.

### 단점

- **콜백 지옥**: 콜백이 중첩될수록 코드 가독성이 크게 떨어짐.
- **에러 처리 어려움**: 여러 콜백에서 발생한 에러를 관리하기 복잡함.

### 예시

```javascript
function fetchData(callback) {
  setTimeout(() => {
    callback(null, 'Data fetched');
  }, 1000);
}

fetchData((error, data) => {
  if (error) {
    console.error(error);
    return;
  }
  console.log(data);
});
```

---

## 3. Synchronous API

### 설명

Synchronous API는 작업이 완료될 때까지 다음 작업이 블록(block)되는 방식입니다. 비동기적 처리가 필요 없는 경우에 사용됩니다.

### 장점

- **단순성**: 코드가 순차적으로 실행되어 이해하기 쉬움.
- **디버깅 용이**: 실행 순서가 명확하여 문제 추적이 쉬움.

### 단점

- **성능 저하**: 블로킹이 발생하여 시스템 리소스가 낭비될 수 있음.
- **스케일링 문제**: 대규모 작업에서는 비효율적.

### 예시

```javascript
function fetchData() {
  return 'Data fetched';
}

const data = fetchData();
console.log(data); // Data fetched
```

---

## 차이점 요약

| 특징     | Promises API | Callback API | Synchronous API |
| ------ | ------------ | ------------ | --------------- |
| 실행 방식  | 비동기          | 비동기          | 동기              |
| 코드 가독성 | 높음           | 낮음           | 매우 높음           |
| 에러 처리  | 간단           | 복잡           | 간단              |
| 블로킹 여부 | 비블로킹         | 비블로킹         | 블로킹             |
| 사용 사례  | 비동기 작업 체이닝   | 간단한 비동기 작업   | 동기적 처리 필요 작업    |

---

## 결론

1. Promises는 비동기 작업을 직관적으로 처리하지만 복잡한 흐름 제어는 어렵습니다.
2. Callback은 간단하지만 콜백 지옥 문제와 에러 관리의 어려움이 있습니다.
3. Synchronous API는 단순하지만 블로킹으로 인해 성능 저하가 발생할 수 있습니다.