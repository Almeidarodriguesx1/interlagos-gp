# Interlagos — fase 0 e prévia da fase 1

A prévia fica disponível em `http://localhost:3011/?interlagos=trecho1`. A URL comum seleciona a referência anterior. A mudança experimental usa larguras totais de 13 a 15 m, derivadas dos perfis existentes no trecho Blender, com transições suaves para o restante da volta. Os mesmos campos de largura alimentam a malha, a projeção usada pela física e a classificação usada pelo áudio. A aparência usa as três texturas Asphalt Track de Dimitrios Savva, Poly Haven, CC0 1.0, reduzidas a 1024 px pela AgentiLoop. Os GLBs A/D são módulos reaproveitados do arquivo Blender local, acomodados nos envelopes de arquibancada que já têm fundação e passaram na checagem de corredor. Os modelos exportados passaram no glTF Validator com zero erros e avisos.

## Calibração e limite desta prévia

| Referência | O que foi possível conferir |
|---|---|
| Planta FIA 2026 | Ordem das curvas, posição relativa do pit lane e comparação gráfica existente no render superior do trecho Blender. A planta é esquemática. |
| Blender e GeoSampa | Largura de 15 m perto da reta, 14 m nas primeiras estações do S e 13 m na saída do Sol. O modelo usa relevo de origem LiDAR. |
| TUM | Polilinha com 4.304,62 m no plano e larguras brutas entre 8,93 e 17,89 m. Os extremos continuam como pontos de revisão visual. |
| AgentiLoop | Traçado completo declarado com 4.309 m e amostras de altura próprias. O reaproveitamento desta fase cobre os mapas de asfalto creditados à Poly Haven. |
| Pista do jogo | As faixas nomeadas T1, T2 e Curva do Sol começam aproximadamente aos 567, 705 e 818 m na progressiva legada. O eixo do Blender coloca os marcos usados de T1, T2 e Sol em cerca de 325, 424 e 537 m da origem local. As duas medidas usam origens e definições diferentes. O descompasso é suficiente para exigir um registro geométrico por marcos em vez de encaixar o GLB inteiro pela distância longitudinal. |

Nesta prévia, a geometria existente continua a definir o eixo, as cotas do pavimento, as zebras e os volumes do pit wall e dos escapes. Os setores A/D usam o envelope de colocação do jogo e são aproximações visuais. Falta calibrar e integrar o eixo e as cotas LiDAR, registrar os desvios entre marcos equivalentes, aplicar o mapa de escape e validar a frenagem em T-Cam contra o onboard real. A prévia não certifica a fase 1 completa.

## Medições

Os arquivos base e previa em JSON registram uma janela de 120 quadros no Chrome headless em T-Cam, com 22 carros carregados, em seco e molhado. São amostras curtas próximas ao grid e não representam uma volta completa nem o pico de memória. Os JPEGs mostram a mesma configuração. Os benchmarks de dinâmica cobrem voltas solo e frenagem em repetição controlada, conforme as condições de cada arquivo.
