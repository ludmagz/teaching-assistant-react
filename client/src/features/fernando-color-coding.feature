Feature: Vizualização com cores da situação dos alunos
    
    As a professor
    I want to inserir todas as notas do aluno
    So that eu possa ver se o aluno foi aprovado, reprovado ou vai para a final

Scenario: coloração dos alunos quando ainda tem alguma nota não preenchida

Given estou na página "Evaluations" na turma "ESS - (2026/1)"
And a opção "média simples" está selecionada
And na linha da aluna "Marina" vejo as notas "7.0","-","-" nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "-"
And o campo "média" da aluna "Marina" não está colorida
When registro a nota "6.9" na meta "Saas"
Then na linha da aluna "Marina" vejo as notas "7.0", "-", "6.9"nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "-"
And o campo "média" da aluna "Marina" não está colorida

Scenario: coloração automática dos alunos quando uma nota é inserida

Given estou na página "Evaluations" na turma "ESS - (2026/1)"
And a opção "média simples" está selecionada
And na linha da aluna "Marina" vejo as notas "7.0","7.0","-" nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "-"
And o campo "média" da aluna "Marina" não está colorida
When registro a nota "9.0" na meta "Saas"
Then eu continuo na página "Evaluations" na turma "ESS - (2026/1)"
And na linha da aluna "Marina" vejo as notas "7.0", "7.0", "9.0" nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "8.0"
And o campo "média" da aluna "Marina" está colorido de verde

Scenario: coloração dos alunos quando a média é arredondada e muda de faixa

Given estou na página "Evaluations" na turma "ESS - (2026/1)"
And a opção "média simples" está selecionada
And na linha da aluna "Marina" vejo as notas "7.0","7.0","-" nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "-"
And o campo "média" da aluna "Marina" não está colorida
When registro a nota "6.9" na meta "Saas"
Then na linha da aluna "Marina" vejo as notas "7.0", "7.0", "6.9" nas metas "Requisitos", "Testes" e "Saas", respectivamente e média "7.0"
And o campo "média" da aluna "Marina" está colorido de verde

Scenario: legenda das colorações da situação do aluno

Given estou na página "Evaluations" na turma "ESS - (2026/1)"
Then abaixo das linhas dos alunos tem a legenda das cores
And a cor verde tem a informação "Aprovado"
And a cor amarelo tem a informação "Final"
And a cor vermelho tem a informação "Reprovado"