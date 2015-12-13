# Relatório - Software Evolution

![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/FEUP.jpg)

### Alunos:
* Luís Pedro Sousa Pinto, ee11169@fe.up.pt
* Rúben Alexandre da Fonseca Marques, ei10117@fe.up.pt 
* Nuno Soares Marques, ee11291@fe.up.pt

## Introdução

Como objetivo deste relatório, iremos apresentar uma interpretação da evolução do software através do que nos foi proposto pela unidade curricular de ESOF. Começamos por identificar e evoluir uma feature para o **Meteor** sem que as restantes funcionalidades fossem quebradas. Para conclusão do relatório, irá ser submetido um patch onde poderá ser aceite (ou não) pelo **Meteor**.

Na fase inicial da unidade curricular de ESOF, foi nos proposto escolher um projeto do [Github](https://github.com/), no qual, o grupo não previa que nos iria ser pedido contribuir com uma nova feature para o mesmo. O **Meteor** já contém vários anos de projeto com um vasto número de contribuidores e features, o que significa que contém bastantes ficheiros e packages complexos. Assim, foi nos complicado escolher uma nova feature para este projeto.

## Identificação da Feature

O repositório do **Meteor** no [Github](https://github.com/meteor/meteor) fornece o projeto open-source, no qual, podemos pesquisar e corrigir possíveis erros que o programa poderá ter. Após analisado, tivemos a ideia de implementar uma nova linha de comando que nos indicava as mudanças de versão para versão do programa **Meteor**. Apesar de o ["log"](https://github.com/meteor/meteor/blob/devel/History.md) ser fornecido no repositório para todos visualizarem, criamos o comando "meteor --about" que nos indicava essas mudanças. Para simplicidade da feature, achamos apenas indicar as mudanças da versão mais recente porque o "log" é extenso para ser visualizado no prompt de comando. 

## Identificação dos componentes que implementam a feature

Para implementarmos a nova feature, era necessário descobrir onde ficava armazenado localmente o ficheiro History.md. Como não conseguimos encontrar a sua localização, foi necessário criarmos um ficheiro [“about.txt”](https://github.com/lpinto93/meteor/blob/devel/tools/cli/about.txt) no qual escrevemos o change log das últimas versões do **Meteor**. Depois disso, descobrimos o ficheiro com o código JavaScript onde foram criados os comandos do terminal e implementámos o comando “--about”.

## Submissão de um Pull Request

Após a implementação da feature, foi feito o [pull request](https://github.com/meteor/meteor/pull/5793) para o repositório do Github.

## FEUP ESOF MIEIC
