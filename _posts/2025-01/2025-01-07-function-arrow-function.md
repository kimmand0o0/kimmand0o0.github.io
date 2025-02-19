---
layout: post
title: Function과 Arrow Function
author: haeran
date: 2025-01-07 21:07:00 +0900
categories: [Study, JavaScript]
banner:
  image: https://blog.kakaocdn.net/dn/bx4in4/btsAqCQLQJe/3fkqWCKSXnYegMU37c4aD0/img.png
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [JavaScript]
---

### 1. 등장 배경
- **JS Function**: 전통적인 방식의 함수 정의로, ECMAScript 초창기부터 존재했습니다. 가독성과 재사용성을 높이는 데 초점이 맞춰졌습니다.
- **Arrow Function**: ES6(2015)에서 도입된 새로운 함수 표기법으로, 짧고 간결한 문법과 더불어 `this` 바인딩 문제를 해결하기 위해 등장했습니다.

### 2. 필요성
- **Arrow Function**은 기존 Function의 다음과 같은 문제를 해결하고자 도입되었습니다:
  1. **간결성**: 반복적인 코드 작성 방지.
  2. **Lexical this**: 함수 내부에서 `this`가 상위 컨텍스트를 유지하도록 보장.
  3. **함수 표현식의 증가**: 콜백 함수, 익명 함수 사용의 간편화.

### 3. 차이점
| **구분**           | **JS Function**                                          | **Arrow Function**                              |
|--------------------|-------------------------------------------------------|----------------------------------------------|
| **문법**           | `function` 키워드를 사용                                 | `=>` 키워드를 사용                           |
| **this 바인딩**    | 호출 시 동적으로 바인딩됨                                | 선언 시 상위 스코프의 `this`를 사용           |
| **생성자 가능 여부**| `new` 키워드를 이용한 생성자 함수로 사용 가능             | 생성자 함수로 사용 불가                      |
| **arguments 객체** | 함수 내부에서 사용 가능                                   | 지원하지 않음 (rest parameter 사용 필요)       |

### 4. this 바인딩
#### 동적 this 바인딩 (JS Function)
JS Function은 호출 시점에 따라 `this`가 동적으로 결정됩니다.
```javascript
function example() {
  console.log(this);
}

const obj = { method: example };
example(); // 전역 객체 (Node.js에서는 undefined)
obj.method(); // obj 객체
```

#### 정적 this 바인딩 (Arrow Function)
Arrow Function은 선언된 위치의 상위 컨텍스트에서 `this`를 결정합니다.
```javascript
const exampleArrow = () => {
  console.log(this);
};

const obj = { method: exampleArrow };
exampleArrow(); // 전역 객체 또는 상위 스코프
obj.method(); // 전역 객체 또는 상위 스코프
```

#### 주요 차이점 요약
- **JS Function**: 호출되는 방식에 따라 `this`가 변경될 수 있음.
- **Arrow Function**: 상위 스코프의 `this`를 유지하여 예측 가능성이 높음.

### 5. 예시
#### JS Function
```javascript
function traditionalFunction(a, b) {
  return a + b;
}
console.log(traditionalFunction(2, 3)); // 5

const obj = {
  value: 10,
  method: function () {
    console.log(this.value); // 10
  },
};
obj.method();
```

#### Arrow Function
```javascript
const arrowFunction = (a, b) => a + b;
console.log(arrowFunction(2, 3)); // 5

const obj2 = {
  value: 10,
  method: () => {
    console.log(this.value); // undefined (상위 컨텍스트의 this 사용)
  },
};
obj2.method();
```

### 6. 결론
Arrow Function은 간결한 문법과 `this`의 예측 가능성을 제공하여, 특히 콜백 함수나 람다식이 필요한 상황에서 유용합니다. 하지만 동적으로 바인딩된 `this`가 필요한 경우에는 전통적인 Function이 더 적합합니다.