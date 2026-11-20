# Carro piloto no Blender — fase 8

Abra **Auriverde-Piloto-Fase8.blend** pelo menu File > Open do Blender. O arquivo foi criado, refinado, renderizado e reaberto no Blender 5.3. Inclui carro, materiais, oito imagens incorporadas, câmera/luzes de estúdio e referência de colisão separada. As unidades estão em metros.

Este é o piloto Auriverde editável derivado do protótipo aprovado, com revisão de bordas, carroceria, ferragens, suspensão, LEDs e materiais. Não é uma reconstrução medida de uma equipe. Seu entre-eixos de 3,60 m corresponde à física atual do jogo; largura visual medida aproximada de 2,007 m e comprimento de 5,007 m. A conversão integral do jogo para regras de 2026 continua separada.

## Editar e ver no jogo

1. Mantenha o arquivo dentro de `kit-blender/fase-8/` da pasta extraída do jogo e salve uma cópia antes de editar.
2. Edite as malhas sob `PilotRoot`. Preserve nomes e posições dos controles. `Studio` e `Collision reference` são auxiliares e ficam fora do GLB de execução.
3. Abra `exportar_para_jogo.py` no Text Editor do Blender e execute. O script exporta somente o carro para `public/models/pilot-v8.glb`, com modificadores, materiais, imagens, normais e tangentes. Corrige tangentes nulas em polos UV, sem alterar posições ou a hierarquia.
4. Execute `npm run dev -- --port 3008` na raiz do projeto e abra a URL mostrada. Recarregue a página após exportar; o carro do jogador é carregado pelo GLTFLoader. Mudanças de arquivo durante desenvolvimento podem reiniciar a sessão do jogo.
5. Confira cockpit, T-Cam e Chase; esterçamento, giro das rodas, volante, LEDs, câmera, pintura e flap traseiro. O restante do grid continua com o modelo anterior.

No Terminal também é possível exportar:

```sh
"/Applications/Blender.app/Contents/MacOS/Blender" --background kit-blender/fase-8/Auriverde-Piloto-Fase8.blend --python kit-blender/fase-8/exportar_para_jogo.py -- "$PWD"
```

Se usar o `.blend` baixado separadamente fora da estrutura do projeto, informe explicitamente a raiz na chamada acima. O script não deve adivinhar um destino fora do projeto.

## Contrato de exportação

Preserve `PilotRoot`, `Body`, `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`, `FrontWing`, `RearWing`, `RearFlap`, `SteeringWheel`, `Helmet`, `Visor`, `CockpitAnchor`, `TcamAnchor`, `OLED`, `Number_Nose` e `LED_00` até `LED_14`. Preserve os materiais `Paint`, `Accent`, `HelmetPaint`, `RainLight`, `TireTread`, `Sidewall`, `WheelSpokes` e `Brake_*`.

Não achate nem una todos os nós: rodas, direção, volante e flap precisam permanecer separados. Não aplique uma rotação extra para compensar eixos; o exportador usa +Y para cima no glTF e o adaptador recompõe os pivôs no referencial do jogo. O jogo verifica nós, triângulos e escala; em erro mantém o piloto procedural anterior e registra o motivo no console.

Para reproduzir o refinamento inicial, `refinar_piloto.py` recebe raiz do projeto e `prototipo-base-nomeado.glb` como argumentos. Esse procedimento recria o arquivo: para trabalho manual continuado, edite o `.blend` e use apenas o exportador.

Valide edições com `npm test`, `npm run lint`, `npm run build` e, quando disponível, `gltf-transform validate public/models/pilot-v8.glb`. O teste automatizado cobre os nós e a coerência entre eixos; a inspeção visual continua necessária.
