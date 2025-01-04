---
title: DOM과 Visual DOM
author: haeran
date: 2025-01-04 21:07:00 +0900
categories: [Study, React]
tags: [React]
---

# DOM과 Visual DOM

## 1. DOM (Document Object Model)

### 1.1. 결정

DOM(Document Object Model)은 웹 페이지를 구성하는 HTML, XML 문서의 구조를 객체(Object) 형태로 나타내는 모델입니다. 즉, 웹 페이지의 각 요소를 프로그램적으로 제어하고 변경할 수 있게 해줍니다. DOM은 브라우저가 HTML 문서를 해석해 트리 구조로 만든 객체 모델입니다.

### 1.2. 구조

DOM은 트리 구조로 구성되며, 각 HTML 태그는 하나의 노드(node)가 되는 그런 구조를 가지며, 부모-자식 구조를 가지며, 각각의 노드는 다양한 유형을 갖을 수 있습니다:

- **Element Node**: HTML 태그
- **Text Node**: 텍스트 컨텐츠
- **Attribute Node**: HTML 속성
- **Document Node**: 문서 자체

### 1.3. DOM의 특징

- **동적**: DOM은 페이지가 로드되면서 JavaScript를 통해 실시간에 수정, 삭제, 추가할 수 있습니다.
- **HTML과 역해**: DOM은 HTML 문서를 기반으로 하고 있으며, 문서의 모든 요소를 객체로 다룰 수 있습니다.

### 1.4. DOM 예시

```html
<!DOCTYPE html>
  <html>
    <head>
      <title>DOM 예시</title>
    </head>
  <body>
    <h1>안녕하세요, DOM!</h1>
    <p>이 문서는 DOM의 예시입니다.</p>
  </body>
</html>
```

위 HTML 문서의 DOM은 트리 구조로 변환되어 각 `<h1>`, `<p>`, `<body>`, `<html>` 태그가 각각 하나의 객체로 표현됩니다.

## 2. Visual DOM (가상 DOM)

### 2.1. 결정

Visual DOM은 실제 DOM을 가상화한 것으로, **변경 상황을 가상으로 처리해 성능을 최적화**하는 기술입니다. React 같은 라이브러리에서 사용되며, 실제 DOM을 직접 수정하는 대신 가상 DOM을 먼저 업데이트하고, 변경된 부분만 실제 DOM에 반영합니다.

### 2.2. 동작 원리

1. **가상 DOM 업데이트**: 상태(state)가 변경되면 React 등은 가상 DOM을 업데이트합니다.
2. **가상 DOM과 실제 DOM 비교**: 가상 DOM과 실제 DOM을 비교해 **변경된 및 가장 작은 변경 부분**만 판결합니다.
3. **효율적 반영**: 변경된 부분만 실제 DOM에 적용해 렌더링 성능을 최적화합니다.

### 2.3. Visual DOM의 장점

- **성능 최적화**: 불필요한 DOM 업데이트를 방지하여 성능을 높입니다.
- **UI 일관성 유지**: 상태 변화에 따라 UI를 효율적으로 관리하고 일관되게 유지합니다.
- **개발 생산성 향상**: 변경된 부분만 업데이트하므로 디버깅과 유지보수가 용이합니다.

### 2.4. Visual DOM 예시 (React)

```javascript
class MyComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = { text: '안녕하세요, Visual DOM!' };
  }

  render() {
    return <h1>{this.state.text}</h1>;
  }
}

ReactDOM.render(<MyComponent />, document.getElementById('root'));
```

위 코드에서 `MyComponent`가 렌더링될 때, 상태 변경이 발생하면 가상 DOM이 먼저 업데이트되고, 실제 DOM과 비교 후 최소한의 변경만 적용됩니다.

## 3. DOM과 Visual DOM의 차이

| **특징**          | **DOM**                                          | **Visual DOM**                                |
|-------------------|------------------------------------------------|---------------------------------------------|
| **구조**          | 실제 DOM 구조                                    | 가상화된 DOM 구조                              |
| **업데이트 방식** | 변경 시 즉각적으로 DOM을 수정                    | 가상 DOM을 수정 후, 실제 DOM에 최소한으로 반영 |
| **성능**          | 많은 업데이트가 발생하면 느려질 수 있음            | 불필요한 업데이트를 방지하여 성능 최적화         |
| **사용 사례**     | 순수 JavaScript로 DOM 조작 시 사용                 | React, Vue 등 현대적인 프레임워크에서 사용       |

## 4. 결론

DOM은 웹 페이지를 구조화하고, JavaScript를 통해 동적으로 조작할 수 있는 강력한 도구입니다. 하지만 직접 DOM을 조작하면 성능 문제나 코드 복잡도가 증가할 수 있습니다. Visual DOM은 이러한 문제를 해결하기 위해 등장했으며, 변경 사항을 가상으로 처리하고 최소한의 변경만 실제 DOM에 반영하여 성능과 개발 생산성을 높입니다. 현대적인 웹 개발에서는 Visual DOM을 활용한 라이브러리가 점점 더 중요한 역할을 하고 있습니다.

