Feature: Cálculo automático de média   
    As a professor
    I want to inserir todas as notas do aluno
    So that eu possa ver a média do aluno

Scenario: calculo de média automático após registro de uma nota

Given estou na página "Evaluations" na turma "ESS - (2026/1)"
And a opção "média simples" está selecionada
And na linha da aluna "Marina" vejo as notas "10.0","8.0","-" nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "-"
When registro a nota "9.0" na meta "Saas"
Then na linha da aluna "Marina" vejo as notas "10.0", "8.0", "9.0" nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "9.0"

Scenario: mensagem de aviso quando o tipo de média não está definido

Given estou na página "Evaluations" na turma "ESS - (2026/1)"
And nenhuma opção está selecionada no campo "Tipo de Média"
And na linha da aluna "Marina" vejo as notas "10.0","8.0","-" nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "-"
When registro a nota "9.0" na meta "Saas"
Then eu continuo na página "Evaluations" na turma "ESS - (2026/1)"
And eu vejo uma mensagem de aviso sobre o tipo de média
And na linha da aluna "Marina" vejo as notas "10.0","8.0","9.0" nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "-"