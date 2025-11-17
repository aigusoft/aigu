export interface IWebComponentDescription {
  title: string /**组件标题 */;
  description: string /**组件详细描述信息，支持markdown */;
  type?: 'page'|'cmpt'|'logic',
  logo?: string /** 描述图标所在asset路径 */;
  props?: {} /**描述组件属性 */;
  events?: {
    emit?: {} /**描述组件对外产生事件 */;
    listener?: {} /**描述组件监听的事件 */;
  };
  slots?: {} /**描述组件插槽(子区域)信息 */;
  api?: any;
}
