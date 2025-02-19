---
layout: post
title: 참조(Reference)와 클로저(Closure)
author: haeran
date: 2025-01-03 21:07:00 +0900
categories: [Study, JavaScript]
banner:
  image: https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRH0QMSZwBSzt9zk4UK6hDtYcbJACnGY_7J4w&s
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [JavaScript]
---

**참조(Reference)**와 **클로저(Closure)**는 둘 다 변수와 데이터의 접근 방식에 관련이 있지만, 완전히 다른 개념입니다. 아래에서 둘의 핵심적인 차이와 역할을 설명합니다.

### 참조 (Reference)
참조는 변수나 데이터에 대한 또 다른 이름 또는 데이터를 가리키는 방식을 의미합니다. 참조를 통해 동일한 데이터를 여러 이름으로 접근하거나, 변수 자체를 간접적으로 다룰 수 있습니다.

#### 특징
- **값이 아닌 주소를 가리킴**.
- 참조된 대상이 바뀌면 참조를 통해 접근한 값도 변경됨.
- 언어에 따라 구현 방식이 다름:
  - **C++**: 참조는 변수의 별칭.
  - **JavaScript**: 객체나 배열과 같은 참조형 데이터는 참조에 의해 전달됨.

#### JavaScript 예제
```javascript
let obj1 = { value: 10 };
let obj2 = obj1;  // obj2는 obj1을 참조
obj2.value = 20;  // obj2를 통해 변경하면 obj1도 변경됨
console.log(obj1.value); // 20
```
참조를 통해 `obj1`과 `obj2`는 같은 객체를 가리킵니다.

### 클로저 (Closure)
클로저는 함수가 자신이 생성된 환경(스코프)에 있는 변수에 접근할 수 있는 특성을 의미합니다. 외부 함수가 종료된 후에도, 내부 함수가 외부 함수의 변수를 기억하고 사용할 수 있음을 뜻합니다.

#### 특징
- **스코프 체인을 기억**: 내부 함수는 외부 함수의 변수에 계속 접근 가능.
- **데이터 은닉과 상태 유지**: 외부 변수는 함수 외부에서 직접 접근할 수 없으므로 캡슐화 가능.
- **메모리 관리 중요**: 클로저를 남발하면 메모리 누수가 발생할 수 있음.

#### JavaScript 예제
```javascript
function outer() {
  let count = 0;
  return function inner() {
    count++;
    console.log(count);
  };
}

const counter = outer();
counter(); // 1
counter(); // 2
```
`inner` 함수는 `outer` 함수가 종료된 후에도 `count` 변수에 접근 가능합니다.

### 참조와 클로저의 차이
| 특징          | 참조 (Reference)                         | 클로저 (Closure)                          |
|---------------|------------------------------------------|-------------------------------------------|
| 역할          | 변수나 객체의 주소를 통해 동일 데이터를 공유 | 외부 함수의 변수나 환경을 기억하고 유지    |
| 적용 대상     | 주로 객체, 배열 또는 참조형 데이터          | 함수와 스코프                              |
| 접근 방식     | 직접 데이터에 접근하거나 다른 이름으로 접근 가능 | 함수 내부에서 외부 스코프의 변수에 접근 가능 |
| 영향          | 하나의 참조가 데이터를 변경하면 다른 참조에도 반영됨 | 외부 함수의 변수를 유지하면서 은닉 가능    |
| 예제          | 객체 간 참조 공유, 배열 공유              | 상태 유지용 함수 생성, 캡슐화 구현         |

### 요약
- **참조**는 객체나 배열처럼 참조형 데이터의 메모리 주소를 공유하며, 데이터를 효율적으로 다룰 수 있게 해줍니다.
- **클로저**는 함수와 스코프의 개념으로, 외부 변수와 상태를 기억하여 특정 작업을 캡슐화하거나 상태를 유지할 때 유용합니다.
- 둘 다 메모리 관리와 관련된 중요한 개념으로, 효율적으로 사용하면 코드의 성능과 구조를 크게 개선할 수 있습니다.

