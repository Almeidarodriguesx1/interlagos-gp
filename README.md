# Interlagos — fase 8: Blender, motor e cenário

Leia PARTE-8-BLENDER-MOTOR-CENARIO.md para mudanças e testes.

```sh
npm ci
npm run dev -- --port 3008
```

O piloto agora é carregado de `public/models/pilot-v8.glb`. Abra o arquivo nativo `kit-blender/fase-8/Auriverde-Piloto-Fase8.blend` no Blender; o guia dessa pasta explica como editar e exportar novamente.

Motor com novas edições da gravação autorizada para reduzir a repetição curta; prédios fora do corredor da pista; arquibancadas com fundações sobre o terreno. Os demais sons e o traçado foram preservados.

I liga/desliga, T alterna manual/automático, Q reduz e E sobe. Pausa ajusta e testa áudio. O modelo e o áudio continuam experimentais, sem certificação integral de F1 2026.

Verificação: `npm run lint`, `npm test`, `npm run build`, `npm run check:geom`, `npm run check:scenery`.


## Modelos Blender — lote 2

Ferrari SF-26, Red Bull RB22 e MCL40 disponíveis em **Modelo 3D do jogador** no menu. Veja [LOTE-2-CARROS-E-BOXES.md](LOTE-2-CARROS-E-BOXES.md) para testar e atualizar os GLBs.
