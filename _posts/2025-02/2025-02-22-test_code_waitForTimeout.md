---
layout: post
title: waitForTimeout 매서드를 꼭 써야할까?
author: haeran
date: 2025-02-22 21:07:00 +0900
categories: [Study]
banner:
  image: https://i-blog.csdnimg.cn/blog_migrate/a4c1ca84c835b5f019d371d2461ccd30.png
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Study, Test_code]
---

## Playwright vs Vitest에서 `waitForTimeout(500)` 사용에 대한 비교

### ✅ **Playwright에서 `waitForTimeout(500)`이 불필요한 이유**
Playwright는 기본적으로 자동 대기 기능을 제공하여, 대부분의 경우 `waitForTimeout(500)`과 같은 명시적인 대기 시간을 설정할 필요가 없습니다. 주요 이유는 다음과 같습니다:

1. **자동 대기 기능**
   Playwright는 대기 시간 설정 없이도 자동으로 이벤트나 요소가 나타날 때까지 기다려줍니다. 예를 들어, `page.once('dialog', callback)`를 사용하면 `dialog` 이벤트가 발생할 때까지 기다립니다. 별도로 `waitForTimeout`을 사용하지 않아도 충분히 동작합니다.

2. **비효율적인 대기 시간 하드코딩**
   `waitForTimeout(500)`은 특정 시간(500ms) 동안 강제로 대기하게 만듭니다. 이는 불필요한 지연을 초래하고, 테스트 환경이나 성능 차이에 따라 다르게 동작할 수 있어 비효율적입니다.

3. **대안적인 방법 사용**
   Playwright는 `waitForEvent`, `waitForSelector`, `waitForFunction` 등 다양한 대기 메서드를 제공하여, 대기 시간을 하드코딩하지 않고도 테스트를 안정적으로 수행할 수 있습니다.   
   예를 들어:
   ```typescript
   const dialog = await page.waitForEvent('dialog');
   expect(dialog.message()).toBe('비밀번호가 일치하지 않습니다');
   await dialog.dismiss();
   ```

### ✅ **Playwright에서 `waitForTimeout(500)`이 필요한 예외적인 경우**
일부 상황에서는 `waitForTimeout`이 유용할 수 있습니다. 예를 들어, 애니메이션이나 UI 업데이트로 인해 충분한 대기 시간이 필요할 때 사용할 수 있습니다.

1. **애니메이션 또는 트랜지션 대기**
   UI 요소가 애니메이션이나 트랜지션을 통해 변할 때, Playwright의 자동 대기 기능이 충분히 기다리지 못할 수 있습니다. 이때 `waitForTimeout(500)`을 추가하여 애니메이션이 완료되도록 대기할 수 있습니다.

2. **테스트 실행 속도가 빠른 경우**
   Playwright는 빠르게 실행되기 때문에, UI가 업데이트되기 전에 테스트가 진행될 수 있습니다. 이 경우 `waitForTimeout(500)`을 사용하여 안정성을 확보할 수 있지만, `waitForSelector` 등의 대체 방법이 더 적합합니다.

---

### ✅ **Vitest에서 `waitForTimeout(500)`이 불필요한 이유**
Vitest는 자동 대기 기능을 제공하여, `waitForTimeout(500)`을 사용하지 않아도 대부분의 경우 안정적인 테스트를 할 수 있습니다.

1. **자동 대기 기능**
   Vitest의 `expect(element).toBeVisible()` 같은 matcher는 요소가 나타날 때까지 자동으로 대기합니다. 또한, `findBy*` 계열 메서드 (`findByText`, `findByRole` 등)는 요소가 나타날 때까지 기다리므로 별도의 대기 시간이 필요 없습니다.

2. **하드코딩된 대기 시간 비효율적**
   `waitForTimeout(500)`은 테스트 실행 환경에 따라 다르게 동작할 수 있으며, 하드코딩된 대기 시간을 추가하는 것은 불필요한 지연을 초래할 수 있습니다.

3. **대안적인 방법 사용**
   Vitest에서도 `waitFor`나 `findBy*` 메서드를 사용하면, 요소가 나타날 때까지 기다린 후 테스트를 실행할 수 있습니다.
   예를 들어:
   ```typescript
   await waitFor(() => expect(something).toBeTruthy());
   await screen.findByRole('alert');
   ```

### ✅ **Vitest에서 `waitForTimeout(500)`이 필요한 예외적인 경우**
Vitest에서도 일부 예외적인 상황에서 `waitForTimeout`이 필요할 수 있습니다. 예를 들어:

1. **애니메이션 또는 트랜지션 대기**
   UI 요소가 애니메이션을 통해 변화하거나, 업데이트가 느리게 일어나는 경우 `waitForTimeout(500)`을 사용하여 애니메이션이 끝날 때까지 기다릴 수 있습니다.

2. **비동기 요청의 빠른 실행**
   API 응답을 기다리기 위해 테스트가 너무 빨리 실행되는 경우, `waitForTimeout(500)`을 사용할 수 있습니다. 그러나, 이럴 때에도 `waitFor`와 같은 메서드 사용을 권장합니다.
   예시:
   ```typescript
   await waitFor(() => expect(mockApi).toHaveBeenCalled());
   ```

### 🎯 **결론**
**Playwright와 Vitest 모두에서 `waitForTimeout(500)`은 대부분의 경우 불필요합니다.** 두 도구 모두 자동 대기 기능과 더 적절한 대체 방법들을 제공하여, 테스트를 안정적으로 수행할 수 있습니다. 하지만 특정 상황에서 애니메이션이나 UI 업데이트가 완료될 때까지 기다려야 하는 경우, 또는 비동기 요청의 실행 속도가 너무 빠를 때 `waitForTimeout`을 사용하는 것이 유용할 수 있습니다. 그렇지만 가능한 한 **대기 시간을 하드코딩하기보다는 Playwright와 Vitest의 대기 메서드를 활용하는 것이 더 좋은 해결책**입니다.
