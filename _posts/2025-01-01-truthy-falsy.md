---
title: truthy & falsy (true가 되는 값 false가 되는 값)
author: haeran
date: 2025-01-01 21:07:00 +0900
categories: [Study, JavaScript]
tags: [JavaScript]
---

# truthy & falsy (true가 되는 값 false가 되는 값)

JavaScript에서 true 또는 false로 평가되는 값은 Truthy와 Falsy라는 두 개념으로 나뉩니다. 이 값들은 논리적 문맥(예: 조건문 if)에서 암시적으로 형변환되어 평가됩니다.

### 1. Falsy 값 (false로 평가되는 값)
다음 값들은 false로 평가됩니다:
```
false
0 (숫자 0)
-0 (음수 0)
0n (BigInt의 0 값)
"" (빈 문자열)
null
undefined
NaN (Not-a-Number)
```

### 2. Truthy 값 (true로 평가되는 값)
Falsy 값에 속하지 않는 모든 값은 Truthy로 평가됩니다.
대표적인 Truthy 값은 다음과 같습니다:

```
true
숫자(0이 아닌 모든 값): 1, -1, 3.14, Infinity, -Infinity
문자열(빈 문자열이 아닌 모든 값): "0", "false", " "
객체(빈 객체 포함): {}, []
함수: function() {}
심볼: Symbol()
BigInt(0n이 아닌 값): 1n, -1n
```

### 3. 특별한 주의 사항
- "false"와 같은 문자열은 Truthy입니다.
- 문자열 내용은 무관하며, 빈 문자열("")만 Falsy입니다.
- `[]`(빈 배열)과 `{}`(빈 객체)는 Truthy입니다.
- 비어 있어도 객체와 배열은 항상 Truthy로 평가됩니다.

```javascript
//예제
if ("false") {
  console.log("Truthy!"); // 출력
}

if ([]) {
  console.log("Truthy!"); // 출력
}

if ({}) {
  console.log("Truthy!"); // 출력
}
```

### 정리
- Falsy 값: false, 0, -0, 0n, ""(공백도 없는 빈 문자열), null, undefined, NaN
- Truthy 값: Falsy 값 외의 모든 값