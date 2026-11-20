# Materiais e dimensões do modelo

Esta fase não afirma medidas oficiais de Interlagos. Larguras dos samples (`widthLeft/right`) estão em metros, por lado; a largura total é a soma. Zebras são malhas separadas. O escape acrescenta 6,95 m além de cada borda, com 0,35 m escondidos sob a pista. A face interna do muro permanece a 6,75 m da borda; o centro do carro é contido a 5,85 m (folga de 0,90 m). Esses números foram centralizados em `surfaceModel.ts`; não ampliam nem estreitam o circuito.

`classifySurface` tem esta ordem: zebra geométrica, pista asfaltada, zona confirmada do escape, escape asfaltado padrão, grama fora do escape. Usa a largura do lado consultado, inclusive em pista assimétrica. O estado `onTrack` continua servindo a regras de corrida; não determina sozinho o material.

O JSON `src/sim/surface-zones.json` está vazio. Cada registro futuro precisa de `trackId`, `start/end` (fração de volta, início incluído/fim excluído, podendo cruzar a chegada), `side`, `minOffset/maxOffset` (metros além da borda, mínimo incluído/máximo excluído), `material`, `validation` e `reference` (fonte e justificativa). Materiais de zonas: asphalt/grass/dirt/gravel; zebras vêm da geometria. `pending` mantém pesquisa sem ativá-la. Somente `confirmed` alimenta os consumidores do respectivo circuito. Limites não finitos, sobreposição, ausência de referência e offsets fora de 0–6,95 m são rejeitados. Confirmar referência e posições antes de editar.

O visual subdivide o escape nos limites exatos das zonas e agrupa índices por material. O JSON não desloca pista, muros ou trajetória da IA. Uma futura zona fora do escape exige ampliar esse suporte visual e rever limites físicos, com validação própria; não basta acrescentar um registro. Materiais terra/brita possuem cor PBR básica para integração; pedras e texturas de referência continuam para outra fase.

A física aplica perfil de aderência seca/molhada, resistência e rigidez lateral ao material no centro do carro. Os quatro contatos do áudio usam o mesmo classificador e são reutilizados entre quadros. Em contato misto, os sons podem começar antes da transição do centro. Isto não implementa uma suspensão/física independente para cada pneu. Coeficientes são ajustes de jogo, não telemetria real.

Pista, zebras, relevo, limites da IA e câmeras não receberam novas dimensões. As mudanças físicas no escape asfaltado retiram a antiga penalidade de superfície fora da linha: asfalto tem as mesmas propriedades de asfalto. As regras de saída de pista e contenção dos muros permanecem.
