# Aproveitamento dos dados do vendedor

Na criação de usuário pelo cadastro de vendedor, além de nome e e-mail, copiar
os campos compatíveis: código ERP, nome reduzido, telefone e data de nascimento.

Na criação por Usuários ou pelo Grupo Econômico, aproveitar os mesmos campos
dos vendedores identificados pelo e-mail informado, ainda sem usuário vinculado.
Consultar somente a empresa de criação ou as empresas selecionadas e autorizadas
do grupo, mantendo a RLS de cada empresa.

Os dados do usuário são únicos no grupo: se um campo tiver valores diferentes
entre os vendedores correspondentes, deixá-lo vazio para preenchimento manual.
Valores ausentes não impedem aproveitar um valor único disponível.

O telefone do vendedor preenche Telefone, sem presumir que seja Celular/WhatsApp.
Perfil, senha e permissões seguem as regras próprias de criação. O preenchimento
não altera usuários existentes nem sincroniza alterações futuras do vendedor.
