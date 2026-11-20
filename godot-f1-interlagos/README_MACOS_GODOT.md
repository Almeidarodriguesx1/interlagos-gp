# Interlagos GP — Projeto Nativo Godot 4 (macOS + Jolt Physics + Metal)

Este diretório contém o projeto completo da **Godot Engine 4.4+** estruturado para rodar nativamente no **macOS (Apple Silicon M1/M2/M3/M4 e Intel)** usando **Apple Metal (`Forward+`)**, **Jolt Physics a 120 Hz** com interpolação de física (zero travamentos) e **suporte automático a cenários 3D feitos com IA (`.glb` + PBR)**.

---

## 1. Instalação no macOS

1. Acesse [https://godotengine.org/download/macos/](https://godotengine.org/download/macos/) e baixe o **Godot Engine 4.4+ (Standard — Universal macOS)**.
2. Extraia o arquivo `.zip` e arraste `Godot.app` para a pasta **Aplicativos (`/Applications`)**.
3. Abra o Godot, clique em **Import** e selecione o arquivo `project.godot` dentro da pasta `godot-f1-interlagos/`.
4. Confirme em **Project → Project Settings → General** (com *Advanced Settings* ativado):
   - **Physics → 3D → Physics Engine**: `Jolt Physics`
   - **Physics → Common → Physics Ticks Per Second**: `120` e **Physics Interpolation**: `On`
   - **Rendering → Renderer**: `forward_plus` (Metal no macOS)
5. Pressione **Cmd + B** (ou **F5**) para rodar direto a **60–120 FPS**.

---

## 2. O que foi corrigido e evoluído nesta versão Godot 4

- **Física de Zebras Independente por Roda (`F1CarController.gd`)**:
  Cada roda usa um `RayCast3D` próprio a `120 Hz`. Ao pisar na zebra (`SurfaceLayer = KERB`), apenas as rodas daquele lado recebem o relevo serrilhado de alta frequência, inclinando o chassi, gerando faíscas do assoalho e aplicando redução real de aderência na chuva (`0.71x`).
- **Colisão Composta 3D Carro-a-Carro (`Jolt Physics`)**:
  Substitui esferas simples por **3 caixas compostas** (asa dianteira `1,98 m`, monocoque/sidepods e conjunto traseiro) + **CCD (`continuous_cd`)**, permitindo disputas roda a roda precisas sem paredes invisíveis e com torque angular realista em toques.
- **Pneus Suaves e Realistas (`ProceduralCarMesh.gd`)**:
  Malha contínua de **64 segmentos** com ombro arredondado e textura Pirelli (`P ZERO` / `CINTURATO`) moldada na lateral, sem facetas poligonais nem discos soltos.
- **Zero Árvores Voando (`TrackBuilder.gd`)**:
  Todo o arvoredo em `MultiMeshInstance3D` e as arquibancadas usam **Raycast vertical contra a malha do terreno** (`ground snap` + afundamento de `-0,4 m` na base) para acompanhar fielmente as subidas e descidas de Interlagos e Spa.
- **Pit Lane Paralelo e Pitstop Jogável (`PitStopManager.gd`)**:
  Faixa dos boxes separada por muro de concreto, limitador de **80 km/h** (`Tecla L` ou automático na zona azul), parada no box da equipe com troca rápida de compostos (**1 = Macio**, **2 = Médio**, **3 = Chuva**) em `2,4 s`.
- **Zero Travamentos & Áudio Nativo (`F1AudioSynth.gd` + `RaceDirector.gd`)**:
  Compilação antecipada dos shaders na entrada, `MultiMeshInstance3D`, LOD automático e sintetizador de áudio em tempo real (`AudioStreamGenerator`) para o ronco V6 Híbrido, turbo e trepidação nas zebras.
- **Largada FIA, Barreiras Físicas & IA Competitiva (`TrackBuilder.gd` + `RaceDirector.gd`)**:
  Pórtico com sequência das 5 luzes vermelhas, muros de contenção e escape (`Runoff`), abertura dedicada para entrada/saída do Pit Lane e rivais controlados por IA seguindo o traçado de **Interlagos, Monza e Spa** com leitura de frenagem nas curvas.

---

## 3. Como usar o fluxo do vídeo (*"Cenário 3D 100% FEITO com IA!"*)

O carregador `GlbPropLoader.gd` busca automaticamente modelos `.glb` em `res://assets/glb/`. Quando não existirem, o simulador gera os equivalentes procedurais PBR para rodar imediatamente.

### Passo a passo para adicionar seus modelos de IA em `.glb`:
1. **Gerar o modelo 3D por IA**: Use ferramentas como **Meshy AI**, **Tripo3D** ou **Luma Genie** para gerar arquibancadas, prédios dos boxes, árvores da Mata Atlântica ou o chassi de F1 e baixe como **`.glb`** (com texturas PBR: Albedo, Normal, Roughness).
2. **Padronizar no Blender (30 segundos)**:
   - Importe o `.glb` no Blender (`File → Import → glTF 2.0`).
   - Ajuste a escala real em metros (`1 unidade = 1 m`, ex.: arquibancada com ~14 m de altura).
   - Coloque a origem na base (`Object → Set Origin → Origin to Geometry`, depois alinhe o ponto mais baixo em `Z = 0` no Blender para que **nunca flutue** na pista).
   - Aplique o modificador *Decimate* para manter props entre **2.000 e 5.000 triângulos**.
   - Exporte em **`.glb`** (`File → Export → glTF 2.0`, marcando *Apply Modifiers* e *Images*).
3. **Colocar no projeto Godot**: Salve dentro de `godot-f1-interlagos/assets/glb/` com um dos nomes reconhecidos:
   - `grandstand.glb` (Arquibancadas)
   - `pit_building.glb` (Prédio dos Boxes)
   - `tree_atlantic.glb` (Árvores do Parque)
   - `timing_tower.glb` (Torre de Cronometragem de Interlagos)
   - `f1_chassis.glb` (Chassi customizado)

Ao abrir o jogo, `GlbPropLoader.gd` instancia tudo via `MultiMeshInstance3D` / `LOD` e aplica *Ground Snap* automático no terreno.

---

## 4. Controles Principais

| Ação | Teclado | Gamepad |
| :--- | :--- | :--- |
| Acelerar / Frear | `W` / `S` ou `↑` / `↓` | `RT` / `LT` |
| Esterçar | `A` / `D` ou `←` / `→` | Analógico Esquerdo |
| DRS | `Espaço` ou `F` | `A` / `✕` |
| ERS (Potência Extra) | `Shift` | `B` / `○` |
| Limitador dos Boxes (80 km/h) | `L` | `X` / `□` |
| Trocar Pneu no Pitstop | `1` Macio · `2` Médio · `3` Chuva | — |
| Trocar Câmera (Chase / Cockpit / T-Cam) | `C` | `Y` / `△` |
| Trocar Circuito (Interlagos / Monza / Spa) | `F2` | — |
| Alternar Clima (Seco / Chuva) | `F3` | — |
| Reiniciar Grid | `R` | — |
| Silenciar Áudio | `M` | — |
| Pausar | `Esc` ou `P` | `Start` |
