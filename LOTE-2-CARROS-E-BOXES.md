# Lote 2: modelos Blender e equipamentos de box

No menu inicial, escolha **Modelo 3D do jogador**. Essa seleção recarrega a página; faça-a antes de configurar sua corrida. Existem o modelo original, MCL40 v0.2 aprovado, Ferrari SF-26 e Red Bull RB22. Os novos carros usam pintura e número fixos; os rivais continuam com seus modelos atuais.

Para iniciar o servidor, nesta pasta:

```bash
npm ci
npm run dev -- --port 3011 --host 127.0.0.1 --strictPort
```

Se as dependências já estiverem instaladas, pule `npm ci`. Abra `http://127.0.0.1:3011/`. Atalhos: `?car=sf26`, `?car=rb22`, `?car=mcl40`.

Os modelos são estudos de aparência, com narizes, sidepods, carenagens e perfis das asas próprios. Eles compartilham a plataforma mecânica estimada do estudo anterior. Não representam CADs nem uma atualização completa das regras de 2026. A geometria de rodas do jogador acompanha o modelo; adversários mantêm a geometria anterior.

Doze objetos decorativos — pneus, carrinhos e macacos — foram colocados sobre a fundação existente dos boxes, fora da pista e das portas. Esse arranjo é provisório e não implementa pit stop jogável.

O kit irmão **lote-2-carros-boxes** contém os arquivos nativos Blender, os GLBs de edição e execução, referências, visualizador, relatório de validação e **PASSO-A-PASSO-JOGO.md**. Para instalar edições novas, use o exportador e o instalador desse kit, preservando nomes e propriedades dos pivôs.

Os arquivos desta versão estão em `public/models/sf26-v01.glb`, `rb22-v01.glb` e `pit-kit-v01.glb`. O importador geral dos estudos fica em `src/engine/mcl40Pilot.ts`; o catálogo em `src/sim/vehicleStudies.ts`; os equipamentos e sua liberação em `src/engine/pitEquipment.ts`.

Verificações: lint, 74 testes, build, check:geom e check:scenery. Também foram conferidos carregamento, seleção do menu, câmeras, telemetria, conexões móveis, troca de clima e de circuito no navegador. Os GLBs passaram no glTF Validator com zero erros e zero avisos. A advertência de chunk grande do Vite permanece; a leitura de 60 FPS no ensaio limitado não demonstra folga de desempenho para um grid inteiro com esses modelos.
