# Segurança

## Como o sistema se protege
- **Rede da igreja:** só o computador da projeção controla sem senha. Celulares e outros computadores precisam do **PIN** (bloqueia após 5 erros). Pregador e pedidos entram por QR com chave válida só para aquele culto.
- **Sites de fora:** o servidor recusa pedidos de outros sites (Host/Origin) e o socket só aceita as páginas do próprio sistema.
- **Arquivos enviados** nunca rodam como página (sandbox). **Links colados** não acessam a rede interna.
- **Configurações sensíveis** (PIN, chaves, token, backup, atualização) só mudam no computador da projeção.
- **Backup** não leva PIN, sessões, token do GitHub nem chave da IA.
- **Atualização** só baixa do repositório configurado, confere que o pacote é da versão anunciada e (quando dá para consultar) só instala versões aprovadas nos testes automáticos.

## Segredos
Nunca coloque tokens, chaves ou a pasta `data/` no repositório (o `.gitignore` já bloqueia `data/`). O token do GitHub usado pela atualização fica só no computador da projeção.

## Encontrou um problema?
Avise o responsável pelo sistema (Marcus) diretamente — não abra uma issue pública com detalhes da falha.
