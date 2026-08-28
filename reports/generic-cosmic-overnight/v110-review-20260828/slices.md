# v1.1 跨風險、裝備與球色切片

Candidate 後附 Candidate−Baseline；pp 是百分點，U 是交付品質效用。以下為等權 benchmark 分組索引，個別家族以 family-details.md 與 cells.jsonl 為準。

## 全裝備的 risk × world

| Risk | World | 必要品質完成 | 一般交貨 | 一般 U |
| --- | --- | --- | --- | --- |
| stable | balanced-iid | 36.04% (+3.19 pp) | 99.73% (-0.25 pp) | 0.7463 (+2.47 pp) |
| stable | normal-heavy-iid | 17.28% (+1.33 pp) | 99.80% (-0.11 pp) | 0.6104 (+2.35 pp) |
| stable | opportunity-scarce-iid | 4.61% (+0.63 pp) | 99.96% (-0.01 pp) | 0.4741 (+1.42 pp) |
| stable | all-normal | 1.73% (+0.11 pp) | 99.97% (-0.00 pp) | 0.4237 (+0.86 pp) |
| balanced | balanced-iid | 42.57% (+3.54 pp) | 99.58% (-0.34 pp) | 0.7818 (+2.11 pp) |
| balanced | normal-heavy-iid | 20.04% (+2.54 pp) | 99.69% (-0.22 pp) | 0.6390 (+1.84 pp) |
| balanced | opportunity-scarce-iid | 4.74% (+0.56 pp) | 99.93% (-0.03 pp) | 0.4996 (+1.14 pp) |
| balanced | all-normal | 1.77% (+0.11 pp) | 99.98% (+0.01 pp) | 0.4470 (+0.58 pp) |
| aggressive | balanced-iid | 43.46% (+4.16 pp) | 99.65% (-0.23 pp) | 0.7886 (+2.07 pp) |
| aggressive | normal-heavy-iid | 20.46% (+2.88 pp) | 99.70% (-0.20 pp) | 0.6433 (+1.61 pp) |
| aggressive | opportunity-scarce-iid | 5.00% (+0.65 pp) | 99.94% (-0.02 pp) | 0.5053 (+1.09 pp) |
| aggressive | all-normal | 1.95% (+0.31 pp) | 99.98% (+0.01 pp) | 0.4527 (+0.62 pp) |

## 三種 risk 等權的 equipment × world

| Equipment | World | 必要品質完成 | 一般交貨 | 一般 U |
| --- | --- | --- | --- | --- |
| E01 | balanced-iid | 25.97% (+4.61 pp) | 99.71% (-0.22 pp) | 0.7367 (+1.96 pp) |
| E01 | normal-heavy-iid | 7.33% (+1.60 pp) | 99.75% (-0.16 pp) | 0.5681 (+1.54 pp) |
| E01 | opportunity-scarce-iid | 0.52% (+0.11 pp) | 99.88% (-0.12 pp) | 0.4245 (+0.85 pp) |
| E01 | all-normal | 0.00% (0.00 pp) | 100.00% (0.00 pp) | 0.3702 (+0.38 pp) |
| E02 | balanced-iid | 57.48% (+4.43 pp) | 99.75% (-0.22 pp) | 0.8458 (+1.95 pp) |
| E02 | normal-heavy-iid | 26.79% (+3.27 pp) | 99.81% (-0.19 pp) | 0.7239 (+2.15 pp) |
| E02 | opportunity-scarce-iid | 6.06% (+0.82 pp) | 100.00% (+0.01 pp) | 0.5747 (+1.40 pp) |
| E02 | all-normal | 1.00% (-0.15 pp) | 100.00% (0.00 pp) | 0.5228 (+0.67 pp) |
| E03 | balanced-iid | 70.24% (+3.27 pp) | 99.67% (-0.32 pp) | 0.8686 (+1.93 pp) |
| E03 | normal-heavy-iid | 34.26% (+4.20 pp) | 99.54% (-0.46 pp) | 0.7590 (+1.73 pp) |
| E03 | opportunity-scarce-iid | 6.55% (+0.63 pp) | 99.96% (-0.04 pp) | 0.6141 (+1.96 pp) |
| E03 | all-normal | 2.16% (0.00 pp) | 100.00% (0.00 pp) | 0.5605 (+1.59 pp) |
| E04 | balanced-iid | 4.13% (+1.12 pp) | 99.39% (-0.42 pp) | 0.5787 (+3.45 pp) |
| E04 | normal-heavy-iid | 0.33% (+0.15 pp) | 99.74% (+0.26 pp) | 0.3899 (+2.67 pp) |
| E04 | opportunity-scarce-iid | 0.00% (0.00 pp) | 99.88% (+0.10 pp) | 0.2709 (+1.10 pp) |
| E04 | all-normal | 0.00% (0.00 pp) | 99.77% (+0.03 pp) | 0.2333 (+0.33 pp) |
| E05 | balanced-iid | 18.38% (+2.75 pp) | 99.54% (-0.27 pp) | 0.7221 (+2.31 pp) |
| E05 | normal-heavy-iid | 4.84% (+0.93 pp) | 99.70% (-0.20 pp) | 0.5544 (+2.44 pp) |
| E05 | opportunity-scarce-iid | 0.11% (+0.07 pp) | 99.96% (-0.04 pp) | 0.4020 (+1.09 pp) |
| E05 | all-normal | 0.00% (0.00 pp) | 100.00% (0.00 pp) | 0.3526 (+0.68 pp) |
| E06 | balanced-iid | 6.85% (+0.67 pp) | 99.51% (-0.42 pp) | 0.6398 (+3.16 pp) |
| E06 | normal-heavy-iid | 1.04% (-0.11 pp) | 99.62% (-0.25 pp) | 0.4434 (+1.69 pp) |
| E06 | opportunity-scarce-iid | 0.04% (+0.04 pp) | 99.91% (-0.04 pp) | 0.3061 (+0.78 pp) |
| E06 | all-normal | 0.00% (0.00 pp) | 100.00% (+0.04 pp) | 0.2620 (+0.78 pp) |
| E07 | balanced-iid | 31.70% (+5.43 pp) | 99.54% (-0.39 pp) | 0.7668 (+1.89 pp) |
| E07 | normal-heavy-iid | 9.26% (+1.30 pp) | 99.87% (-0.07 pp) | 0.6200 (+1.84 pp) |
| E07 | opportunity-scarce-iid | 1.38% (+0.04 pp) | 100.00% (0.00 pp) | 0.4749 (+1.17 pp) |
| E07 | all-normal | 0.00% (0.00 pp) | 100.00% (0.00 pp) | 0.4211 (+0.78 pp) |
| E08 | balanced-iid | 40.59% (+6.21 pp) | 99.71% (-0.25 pp) | 0.7832 (+2.33 pp) |
| E08 | normal-heavy-iid | 11.94% (+2.16 pp) | 99.65% (-0.30 pp) | 0.6464 (+1.96 pp) |
| E08 | opportunity-scarce-iid | 1.97% (-0.11 pp) | 99.91% (0.00 pp) | 0.5122 (+1.06 pp) |
| E08 | all-normal | 0.00% (0.00 pp) | 100.00% (0.00 pp) | 0.4478 (+0.48 pp) |
| E09 | balanced-iid | 71.61% (+3.61 pp) | 99.81% (-0.19 pp) | 0.8789 (+1.51 pp) |
| E09 | normal-heavy-iid | 43.82% (+5.32 pp) | 99.84% (-0.16 pp) | 0.7859 (+1.67 pp) |
| E09 | opportunity-scarce-iid | 13.50% (+2.34 pp) | 99.96% (-0.04 pp) | 0.6593 (+1.44 pp) |
| E09 | all-normal | 5.80% (+0.89 pp) | 100.00% (0.00 pp) | 0.6036 (+0.36 pp) |
| E10 | balanced-iid | 79.95% (+4.20 pp) | 99.90% (-0.04 pp) | 0.9019 (+1.67 pp) |
| E10 | normal-heavy-iid | 52.98% (+3.68 pp) | 99.80% (-0.20 pp) | 0.8181 (+1.63 pp) |
| E10 | opportunity-scarce-iid | 17.71% (+2.16 pp) | 99.96% (-0.04 pp) | 0.6912 (+1.29 pp) |
| E10 | all-normal | 9.23% (+1.04 pp) | 100.00% (0.00 pp) | 0.6377 (+0.82 pp) |

## 裝備映射

| Code | Equipment ID |
| --- | --- |
| E01 | player-unbuffed-cosmic-tool-v1 |
| E02 | player-food-medicine-cosmic-tool-v1 |
| E03 | player-food-medicine-specialist-cosmic-tool-v1 |
| E04 | generic-mixed-i720-i690-hq-unmelded-v1 |
| E05 | generic-mixed-i720-i690-hq-unmelded-buffed-v1 |
| E06 | generic-i750-hq-unmelded-v1 |
| E07 | generic-i750-hq-unmelded-buffed-v1 |
| E08 | generic-i750-hq-five-meld-template-v1 |
| E09 | generic-i750-hq-five-meld-template-buffed-v1 |
| E10 | generic-i750-hq-five-meld-template-buffed-specialist-v1 |
