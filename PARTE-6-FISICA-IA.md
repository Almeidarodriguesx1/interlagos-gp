# Parte 6 — curvatura, aderência combinada e IA

Entrega de 18/11/2026. Versão web; o projeto Godot permanece separado. Esta parte corrige a base física e traz medições reproduzíveis. A calibração de ritmo F1 e a conversão integral para regras de 2026 continuam pendentes.

## Como testar esta versão

Extraia `interlagos-parte-6-fisica-ia.zip` em uma pasta nova. No Terminal, dentro da pasta extraída:

```sh
npm ci
npm run dev -- --port 3006
```

Abra exatamente a URL exibida pelo Vite; não reutilize uma aba de um servidor antigo. Não abra `dist/index.html` pelo Finder. Não precisa de chave de IA para dirigir.

1. Selecione Interlagos, seco, competitivo, ABS/TC ligados, inicialmente com câmbio automático. Complete uma volta antes de comparar tempos.
2. Freie antes de esterçar nas curvas apertadas; freio e direção agora dividem o mesmo limite de aderência. Frear completamente enquanto vira deve abrir a trajetória em relação a frear em linha reta.
3. Repita no molhado: a distância de frenagem aumenta. A comparação deve começar da mesma velocidade e no mesmo trecho.
4. Confira a zebra que você aprovou e os sons de chuva/passagem já entregues. Nesta etapa os arquivos de áudio e sua mixagem não foram alterados.
5. I liga/desliga; T alterna manual/automático; Q reduz; E sobe. A partida mantém a espera de 0,7 s da Parte 5. Se o carro começou desligado, dê partida antes de acelerar. Pausa mostra o estado e os controles de áudio.

Os recordes e ghosts usam uma nova chave de física (`physics-v3`). Tempos anteriores continuam armazenados no navegador, mas não são comparados a voltas obtidas com forças e aderência diferentes. Portanto, a nova versão pode mostrar melhor volta vazia mesmo com histórico antigo.

## Correções implementadas

- **Curvatura para condução:** a aproximação antiga retorna aproximadamente metade de `1/R` em um círculo. Um raio de 50 m produzia aproximadamente 0,010, quando deveria produzir 0,020 m⁻¹. `dynamics.ts` calcula a curvatura horizontal por três pontos; `track.ts` disponibiliza `drivingCurvature`. IA e aviso de frenagem usam esse valor. O campo legado continua servindo às zebras, inclinação e visual existentes.
- **Forças compartilhadas:** aceleração/frenagem e força lateral disputam um orçamento circular comum. Antes, era possível gastar aderência longitudinal e lateral quase independentemente. O cálculo de capacidade cresce sublinearmente com a carga aerodinâmica, reduzindo a frenagem excessiva.
- **Integração da velocidade:** a velocidade é atualizada no referencial anterior do carro e convertida para o mundo nesse mesmo referencial. Girar a carroceria deixou de girar automaticamente o vetor de velocidade sem pagar força lateral.
- **IA:** previsão de curva considera a capacidade de pneus/carga, antecipa frenagens e usa direção de perseguição geométrica com o limite de esterço dependente da velocidade. Deslocamento de linha reduzido e dificuldade lendária limitada para não exigir aderência inexistente. O resultado é estável, mas ainda conservador.
- **Contato com muro:** perda tangencial de velocidade depende da intensidade da componente que aponta contra o muro. Um contato quase paralelo não recebe o mesmo amortecimento que uma pancada frontal.
- **Reprodutibilidade:** benchmark headless usa 180 Hz, o mesmo passo físico do jogo. Nenhuma dependência nova foi instalada.

Os coeficientes `BASE_TIRE_MU=1,30` e `LOAD_EXPONENT=0,80` são ajustes empíricos de jogo. O modelo continua agregado; não é dinâmica completa por roda, suspensão ou dados medidos de pneus.

## Medições antes e depois

Comparação executada com o código da Parte 5 extraído do ZIP anterior e esta versão. Interlagos, Time Trial solo, três voltas lançadas, pneus padrão, desgaste ligado, ABS/TC ligados, dificuldade especificada; sem modelo de combustível. Não confundir esse ensaio com tráfego, classificação real ou telemetria de 2026.

| Condição | Parte 5: segunda volta | Parte 6: segunda volta | Máxima Parte 6 |
|---|---:|---:|---:|
| Seco, iniciante | 1:02.622 | 1:26.889 | 286,1 km/h |
| Seco, competitivo | 0:58.583 | 1:21.867 | 319,5 km/h |
| Seco, pro | 0:56.528 | 1:19.161 | 334,4 km/h |
| Seco, lendário | 0:55.861 | 1:18.394 | 334,7 km/h |
| Molhado, competitivo | 1:02.461 | 1:33.228 | 318,0 km/h |

As cinco configurações da Parte 6 completaram as três voltas medidas sem saída de pista nem impacto. A ordenação das dificuldades e a diferença seco/molhado ficam travadas por teste. O resultado **não comprova ritmo real de F1**: a IA freia por aproximadamente 25,7 s por volta em pro, enquanto a referência Brembo 2025 informa menos de 12 s. Reduzir essa diferença exige refinar a trajetória e o perfil de frenagem, além de validar a geometria real; não recuperar aderência artificial para alcançar um cronômetro.

### Frenagem isolada

Trecho inicial de reta, posição normalizada aproximadamente 0,03, direção neutra, de 325 para 123 km/h. Distância acumulada da trajetória horizontal, desaceleração calculada pela diferença de velocidade por passo, pico sem colisões. Não é uma reprodução da entrada da curva 1.

| Resultado | Parte 5 seco | Parte 6 seco | Parte 6 molhado |
|---|---:|---:|---:|
| Distância | 66,0 m | 121,3 m | 149,5 m |
| Tempo | 1,156 s | 2,100 s | 2,594 s |
| Desaceleração máxima | 8,86 g | 4,44 g | 3,65 g |
| Impactos / passos fora da pista | 0 / 0 | 0 / 0 | 0 / 0 |

Referência de contexto: [Brembo, São Paulo 2025](https://www.brembo.com/en/motorsport/formula1/2025/facts-formula1-gp-san-paolo) informa para T1 325→123 km/h, 126 m, 2,39 s e 4,6 g. São condições/traçado de frenagem distintos do teste. A proximidade da distância não valida a curva inteira de desaceleração, cujo tempo ainda difere.

A [página Brembo 2026](https://www.brembo.com/en/motorsport/formula1/2026/facts-brazil-2026) informa **simulações** para T1: 312→115 km/h, 156 m, 2,93 s e 3,7 g. Não tratamos esses valores como telemetria medida nem como parâmetros já implementados nesta versão.

## Verificação

```sh
npm run lint
npm test
npm run build
npm run check:geom
npm run benchmark:dynamics
```

- **53 testes passaram.** Quatro novos testes cobrem raio analítico/curvatura, sensibilidade à carga/orçamento combinado, limite de aceleração integrado ao frear e virar, e três voltas de IA por dificuldade/clima.
- Teste de frenagem antigo (302→90 km/h em até 73 m) substituído por ensaio em reta sem contato/saída de pista, com limites explícitos para seco/molhado e redução de marchas. Os limites são envelopes de regressão deste modelo, não valores oficiais.
- Teste do grid agora mede penetração dos mesmos três círculos que formam cada carro, a 180 Hz. A regra anterior de centros separados por 3,05 m rejeitava ultrapassagens lado a lado legítimas. Não se permite interpenetração acima de 3 cm; todos os dez carros precisam continuar em movimento após 30 s.
- Retorno da ré continua testado, com até 1,5 s para frear a marcha à ré e ganhar velocidade para frente com a nova aderência.
- `lint`, build e `check:geom` passaram. Checagem geométrica passou em Interlagos, Monza e Spa. Comparação de todos os samples legados confirmou geometria, larguras, inclinações e zebras idênticas à Parte 5 nos três circuitos.
- Os 17 arquivos em `public/audio/` são idênticos por SHA-256 aos do ZIP da Parte 5. Nenhum som sintetizado foi ativado. `engineReady=false` continua esperado para o onboard experimental; ele não se tornou um banco calibrado de seis faixas.
- Smoke test no Chrome: ignição por I, transmissão manual, subida de marcha, controles de chuva/rivais e dez sliders presentes, sem exceções JavaScript. Não substitui escuta nem julgamento de dirigibilidade pelo jogador.

Relatórios: `validacao-fisica-parte6.json` (antes/depois, médias por setor e preservação geométrica), `validacao-assets-parte6.json`, `validacao-ui-parte6.json` e `validacao-parte6.json`.

O build mantém o aviso de JavaScript acima de 500 kB (aproximadamente 1,04 MB minificado / 289 kB gzip). O aviso de configuração futura do Vite também permanece. Esta fase não fez uma otimização de cena; FPS visto durante o smoke test não é benchmark sustentado da GPU do Mac. O acumulador continua limitado a 18 passos/quadro e pode descartar tempo abaixo de 10 FPS.

## Próxima parte

1. Calibrar a trajetória e o perfil contínuo de velocidade/frenagem da IA por trecho, com comparação de telemetria; o ritmo atual conservador permanece uma pendência explícita.
2. Validar larguras, cotas e curvas contra referências reais antes de mover geometria ou muros. O traçado foi preservado, sem zonas fictícias de brita/grama.
3. Unificar a era do carro: massa de 798 kg, DRS e ERS simplificado são heranças anteriores; o onboard não certifica um carro de 2026. Não houve conversão integral de regras nesta parte.
4. Preparar o carro piloto do Blender em fase separada e medir orçamento de renderização antes de multiplicar detalhes no grid.

Chuva mais detalhada, cortes de motor cobrindo RPM conhecidos, água/spray dedicados e o kit Blender continuam produção própria das fases seguintes. Esta parte preserva as melhorias de áudio e controles já entregues.
