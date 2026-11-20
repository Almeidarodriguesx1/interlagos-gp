# Diretrizes de Engenharia, Game Feel, PBR e Áudio — Interlagos GP

Este guia consolida as práticas de engenharia, diagnóstico de *game feel*, arquitetura de áudio, câmera e renderização 3D extraídas das referências de estúdio e aplicadas diretamente ao simulador:

- `Donchitos/Claude-Code-Game-Studios` (arquitetura por papéis e separação entre simulação, áudio, arte técnica e testes)
- `fagemx/gstack-game` (auditoria de *Flow State*, diagnóstico `/feel-pass` e resposta tátil orientada ao jogador)
- `abagames/agentic-gamedev-skills` (limites por eventos, variação de timbre, contagem temporal baseada em relógio real)
- `omer-metin/skills-for-antigravity` (padrões de produção para Web Audio e WebGL/Three.js)
- `gamedev-skills/awesome-gamedev-agent-skills` (trauma quadrático de câmera, *bus mixing* com *ducking*, áudio posicional 3D e orçamento de renderização)

---

## 1. Arquitetura & Loop de Simulação

1. **Separação Estrita entre Simulação e Apresentação**:
   - A física veicular (`src/sim/`) roda em TypeScript puro a `180 Hz` por acumulador de tempo (3 passos em média a 60 FPS; não fixar 3 passos por quadro), sem dependências de DOM, Three.js ou Web Audio.
   - Recuperação limitada a 18 passos/quadro (100 ms): quedas abaixo de 10 FPS descartam tempo e são reportadas no diagnóstico.
   - A camada visual e sonora (`src/engine/`, `src/audio/`) atua exclusivamente como observadora do estado físico e dos eventos semânticos emitidos por quadro.
2. **Tempo Real em Efeitos Temporais**:
   - Nunca atrelar timers de recuperação (efeitos de impacto, *ducking* de áudio, decaimento de trauma) a `dt` zerável ou taxa de quadros fixa; usar `performance.now()` ou `AudioContext.currentTime` para manter transições consistentes em qualquer monitor (60 Hz, 120 Hz, 144 Hz).
3. **Zero Alocação (Zero GC) no Loop Principal**:
   - Pré-alocar vetores (`THREE.Vector3`), matrizes (`THREE.Object3D`), cores (`THREE.Color`) e quaternions fora do `tick()`.
   - Meta progressiva: ainda há alocações em projeção da pista, IA e parâmetros do áudio; não afirmar zero GC global. O amostrador de contato reutiliza os quatro objetos e o acumulador usa apenas escalares.
   - Partículas (spray, fumaça, faíscas, detritos de zebra, chamas e marcas de pneu) operam sobre `THREE.InstancedMesh` em *ring buffers* de tamanho fixo.

---

## 2. Game Feel & Câmera Dinâmica (`/feel-pass`)

1. **Trauma Quadrático com Ruído Contínuo**:
   - Aplicar vibração pela fórmula:
     `shake = maxShake * (trauma ^ 2) * simplexNoise(t)`
   - Usar ruído contínuo (`simplex-noise`) em vez de senoides puras para evitar sensação mecânica repetitiva ao atacar zebras ou sofrer impactos.
   - Manter câmeras *onboard* (`Cockpit` e `T-Cam`) limpas e nítidas — apenas micro-resposta física sem tremulação excessiva que prejudique a leitura de ponto de freada.
2. **Suavização Exponencial e *Apex Look-Ahead***:
   - Toda transição de posição, alvo e FOV usa amortecimento independente de FPS (`THREE.MathUtils.damp` / `1 - exp(-k * dt)`).
   - Na câmera *Chase*, antecipar levemente a direção da curva e da deriva (*slip angle*) para dar leitura imediata de saída de traseira (*oversteer*).
3. **Empilhamento Multi-Sensorial (Regra dos 100 ms)**:
   - Eventos críticos (passar na zebra, travar roda, acionar limitador de giro, encostar no guard-rail) disparam em conjunto: som dedicado + partículas físicas + resposta de câmera + vibração analógica (*Gamepad dual-rumble*).

---

## 3. Áudio gravado e materiais compartilhados — atualizado na Parte 4

1. **Fontes reais**: `RecordedAudioEngine` é o motor ativo. O sintetizador antigo fica no repositório, mas não é instanciado pela corrida. Não há fallback sintetizado autorizado. Sons ausentes permanecem identificados como pendências.
2. **Barramentos**: `engine`, `surfaces`, `wind`, `impacts` e `ui` alimentam o master/compressor. Testes do menu usam esses mesmos barramentos. Créditos/edições ficam em `public/audio/`; a calibração do V6 depende de seis gravações e aprovação em `engine-approval.json`.
3. **Carregamento**: WAV/OGG externos locais, com conferência de resposta/decodificação e orçamento de 64 MiB decodificados. A regra antiga de “zero arquivos de áudio externos” foi substituída. O compressor não substitui medição de loudness e escuta.
4. **Materiais**: `src/sim/surfaceModel.ts` e `src/sim/surface-zones.json` são a referência comum de física, visual do escape e som por roda. Road/kerb vêm da geometria existente; zonas de escape precisam de circuito, referência e confirmação. Registros pending não são ativados. Nesta fase só se autoram zonas dentro da faixa de 6,95 m já gerada, sem alterar muros. Fora dela, permanece o terreno gramado existente.
5. **Limite atual**: coeficientes físicos são parâmetros de jogo, não dados medidos de pneus F1. A física consulta o centro do carro; o áudio consulta quatro contatos. Não confundir geometria preservada com precisão topográfica comprovada. Não criar áreas reais por estimativa sem validação.

## 4. Texturas PBR HD, Shaders & Iluminação HDRI

1. **Espaço de Cor e Anisotropia**:
   - Texturas de cor/albedo usam `THREE.SRGBColorSpace` e `anisotropy = renderer.capabilities.getMaxAnisotropy()`.
   - Mapas físicos (`normalMap`, `roughnessMap`, `aoMap`) permanecem estritamente em espaço linear (`NoColorSpace`) com canais UV2 configurados para oclusão ambiente.
2. **Iluminação Baseada em Imagem (HDRI + PMREM) sem Névoa Lavada**:
   - Gerar ambiente HDRI procedural calibrado via `PMREMGenerator` para pista **Seca** e **Chuva**, garantindo reflexos metálicos/verniz (`clearcoat`) e brilho realista nas poças molhadas.
   - Manter `FogExp2` discreto apenas para profundidade distante no horizonte e evitar pós-processamento de *bloom* em tela cheia sobre o céu diurno.
3. **Extensão PBR por Shader (`onBeforeCompile`)**:
   - Poças dinâmicas e variação de espelho d'água na chuva devem estender `MeshStandardMaterial` via `onBeforeCompile` para preservar sombras e iluminação física completa.
4. **Compatibilidade Universal (`isSoftwareGl`)**:
   - Em renderizadores por software (SwiftShader/llvmpipe), manter exatamente o mesmo conteúdo de cena, materiais e HUD — reduzindo apenas custo de pós-processamento, sombras e *pixel ratio* e pausando o loop via `afterDraw`.


## 5. Calibração verificável — Parte 6

- `drivingCurvature` é a curvatura horizontal para a IA e o aviso de frenagem. `curvature`/`absCurvature` legados preservam visual, zebras e camber; não trocar esses campos sem revisar toda a geometria.
- Forças dos pneus compartilham um orçamento circular com sensibilidade à carga. Coeficientes são empíricos, sem certificação de F1 2026. Mudanças de física precisam de benchmark de voltas e frenagem, além de testes unitários.
- `npm run benchmark:dynamics` mede a 180 Hz. Rejeitar medições de freio com colisões ou saída de pista. Guardar condições, unidades e versão física.
- Recordes/ghosts são separados pela versão física. Aumentar `DYNAMICS_VERSION` ao alterar substancialmente o desempenho do carro.
- A IA atual ainda freia cedo e por tempo demais. Não confundir três voltas estáveis com ritmo de F1 validado. Conversão de era, geometria real e modelo Blender seguem pendentes.


## 6. Cenário e colisões — Parte 7

- `scenery.ts` é a fonte das posições de placas/postes compartilhadas por física e visual. O estado de quebra pertence à sessão; nunca compartilhar estado mutável entre corrida e demonstração.
- Contato estático usa impulso no ponto, com inércia e limite de atrito. Não reintroduzir alinhamento automático do nariz ao muro. O modelo é 2D; os coeficientes e danos são empíricos.
- Público e tufos usam InstancedMesh, sem recriação por quadro. UV de grama usa escala em coordenadas de mundo, igual no terreno e talude.
- Troca de cenário libera geometrias, materiais e buffers de instâncias; texturas compartilhadas continuam pertencendo a `textures.ts`. Verificar contagens após ciclos de pista.
- Somente o slot visual do jogador recebe a carroceria/detalhe piloto. O GLB em kit-blender é referência editável; ainda não existe carregamento automático de um substituto GLB.
- O entre-eixos visual herdado (3,10 m) e o físico (3,60 m) precisam ser unificados com a definição da era. Não chamar o protótipo de réplica fiel de 2026.


## 7. Pipeline Blender e estruturas — fase 8

- O piloto usa GLTFLoader e contrato de nós em blenderPilot.ts. Preserve rodas, direção, volante, câmeras e flap separados; validar o GLB após cada edição. A fonte .blend e scripts estão em kit-blender/fase-8.
- O entre-eixos visual do piloto passou a 3,60 m, coerente com a física atual. O grid procedural mantém os valores anteriores; a conversão integral para 2026 continua pendente.
- Estruturas usam área ocupada completa e margem do corredor, não somente o centro. Apoios consultam os triângulos renderizados do terreno. As posições decorativas não equivalem a levantamento real do circuito.
- O onboard usa três texturas gravadas de 7,92 s, com variação lenta e taxa contínua por RPM. Não tratar a referência de afinação como RPM comprovado da fonte. Preservar os outros efeitos aprovados.
