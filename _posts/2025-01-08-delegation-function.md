---
title: 위임 함수 (Delegation Function)와 역제어 (Inversion of Control, IoC)
author: haeran
date: 2025-01-08 21:07:00 +0900
categories: [Study, JavaScript]
tags: [JavaScript]
---

# 위임 함수 (Delegation Function)와 역제어 =(Inversion of Control, IoC)

## 위임 함수 (Delegation Function)

위임 함수는 특정 동작을 다른 객체나 함수에 위임하는 패턴으로, 재사용성과 유연성을 증가시킵니다. 이를 통해 특정 로직을 캡슐화하고 다른 부분에서 재사용할 수 있습니다.

### 장점
- **코드 재사용성**: 공통된 로직을 별도로 정의하여 여러 곳에서 활용 가능
- **유지보수 용이성**: 로직 변경 시 한 곳에서 수정하면 됨
- **동적 요소 처리**: 이벤트 위임처럼 동적으로 생성된 요소도 처리 가능

### 단점
- **디버깅 어려움**: 위임 과정에서 발생하는 버그를 추적하기 어려울 수 있음
- **복잡성 증가**: 지나치게 많이 사용하면 코드의 흐름이 복잡해질 가능성

### 예제: 이벤트 위임

부모 요소에 이벤트 리스너를 등록하여 하위 요소의 이벤트를 처리합니다.

```javascript
const parentElement = document.getElementById('parent');

parentElement.addEventListener('click', (event) => {
    if (event.target && event.target.matches('.child')) {
        console.log('Child element clicked:', event.target);
    }
});
```

위임 함수는 코드 중복을 줄이고 동적으로 생성되는 요소에도 적용될 수 있습니다.

## 역제어 (Inversion of Control, IoC)

역제어는 실행 흐름의 제어권을 개발자가 아닌 프레임워크나 다른 코드가 갖도록 하는 개념입니다. 이를 통해 애플리케이션의 주요 로직을 독립적으로 설계할 수 있습니다.

### 장점
- **유연성 증가**: 코드의 실행 흐름을 외부에서 제어하므로 다양한 환경에서 재사용 가능
- **모듈화**: 특정 동작을 독립적으로 설계하여 확장성과 테스트 용이성 증가

### 단점
- **복잡성 증가**: 초보 개발자에게는 생소할 수 있음
- **제어권 상실**: 흐름을 완전히 이해하지 못하면 예기치 못한 동작이 발생할 가능성

### 예제: 콜백 함수 사용

```javascript
function fetchData(callback) {
    setTimeout(() => {
        const data = { id: 1, name: 'John Doe' };
        callback(data); // 제어권을 콜백 함수에 위임
    }, 1000);
}

function handleData(data) {
    console.log('Data received:', data);
}

fetchData(handleData);
```

### 예제: Promise를 활용한 IoC

```javascript
function fetchDataWithPromise() {
    return new Promise((resolve) => {
        setTimeout(() => {
            const data = { id: 2, name: 'Jane Doe' };
            resolve(data); // 제어권을 Promise 체인에 위임
        }, 1000);
    });
}

fetchDataWithPromise()
    .then((data) => {
        console.log('Data received via Promise:', data);
    });
```

IoC는 제어 흐름을 프레임워크나 비동기 처리 체계에 위임하여 코드의 유연성과 확장성을 증가시킵니다.

## 결론

1. **위임 함수**는 코드 재사용성과 유지보수성을 향상시키는 강력한 패턴입니다.
2. **역제어 (IoC)**는 제어권을 외부로 넘겨 코드의 유연성과 확장성을 증가시킵니다.
3. 적절히 사용하면 코드 품질을 높일 수 있지만, 과도한 사용은 복잡성을 초래할 수 있습니다.
