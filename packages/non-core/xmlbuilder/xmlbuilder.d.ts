// Minimal typing for the XmlBuilder global (the `xmlbuilder` npm module).
interface XmlBuilderElement {
  ele(name: string, attrs?: object, text?: string): XmlBuilderElement;
  att(name: string, value: string): XmlBuilderElement;
  txt(text: string): XmlBuilderElement;
  up(): XmlBuilderElement;
  end(options?: object): string;
}

export const XmlBuilder: {
  create(name: string, options?: object): XmlBuilderElement;
  begin(): XmlBuilderElement;
};
