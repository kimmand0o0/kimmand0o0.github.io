---
title: 비동기화를 위한 두 가지 방법 - 스레드(Thread)와 버퍼(Buffer)
author: haeran
date: 2025-01-10 21:07:00 +0900
categories: [Study, JavaScript]
tags: [JavaScript]
---

## 1. 스레드(Thread)
스레드는 프로그램 내에서 병렬 처리를 가능하게 만드는 실행 단위입니다. 각 스레드는 독립적인 작업을 수행할 수 있어, 동시에 여러 작업을 실행하는 데 사용됩니다.

#### 장점
- **병렬 처리**: 여러 작업을 동시에 수행 가능하여 성능이 향상될 수 있음.
- **대기 시간 감소**: I/O 작업 중에 CPU가 유휴 상태로 대기하지 않도록 설계 가능.
- **멀티코어 활용**: 현대 CPU의 멀티코어 아키텍처를 효율적으로 사용 가능.

#### 단점
- **복잡성 증가**: 스레드 간 동기화 및 공유 자원 관리는 어렵고, 잠재적 버그를 초래할 수 있음.
- **컨텍스트 스위칭 오버헤드**: 스레드 간 전환 시 CPU 자원이 소비됨.
- **메모리 소비**: 각 스레드는 고유의 스택을 유지해야 하므로 메모리 자원이 필요.

## 2. 버퍼(Buffer)
버퍼는 데이터를 임시 저장하는 메모리 공간으로, 생산자와 소비자 간의 데이터 흐름을 비동기적으로 처리할 수 있게 합니다. 생산자가 데이터를 생성하고 버퍼에 저장하면, 소비자는 이를 가져가서 처리합니다.

#### 장점
- **단순성**: 구현이 상대적으로 간단하고 직관적임.
- **동시성 제어**: 생산자와 소비자의 작업을 분리하여 동시성을 쉽게 관리.
- **리소스 효율성**: 컨텍스트 스위칭이 필요하지 않아 오버헤드가 적음.

#### 단점
- **버퍼 크기 제한**: 버퍼가 가득 차거나 비어 있는 경우 추가 처리가 필요함.
- **추가 메모리 필요**: 버퍼 공간을 할당해야 함.
- **지연 발생 가능성**: 버퍼가 비거나 가득 찬 경우 작업 지연.

## 차이점
| 특성           | 스레드(Thread)             | 버퍼(Buffer)              |
|----------------|-----------------------------|---------------------------|
| 동시 처리 방식  | 병렬로 여러 작업 수행        | 작업 흐름을 순차적으로 분리 |
| 오버헤드       | 컨텍스트 스위칭으로 인한 오버헤드 존재 | 상대적으로 낮음            |
| 구현 복잡도    | 높음                        | 낮음                      |
| 메모리 사용    | 각 스레드마다 스택 필요       | 버퍼 크기만큼 메모리 사용   |

## 결론
1. 스레드(Thread)는 병렬 처리를 통해 성능을 극대화하지만, 복잡성과 오버헤드가 높음.
2. 버퍼(Buffer)는 구현이 간단하고 안정적인 동시성을 제공하지만, 크기 제한과 지연이 문제.
3. 상황에 따라 두 방법을 적절히 조합하여 사용하는 것이 가장 효율적.