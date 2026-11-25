"""Generate clearly synthetic test images; no real ticker or market feed."""
from PIL import Image,ImageDraw,ImageFont,ImageFilter
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]/'public/vision-fixtures';root.mkdir(parents=True,exist_ok=True)
font=lambda size:ImageFont.truetype('DejaVuSans.ttf',size)
im=Image.new('RGB',(960,540),'white');d=ImageDraw.Draw(im)
d.text((40,22),'DEMOCO (DEMO) - SYNTHETIC CHART',font=font(29),fill='#123d45')
d.text((40,63),'FICTIONAL VALUES / NOT REAL MARKET DATA',font=font(19),fill='#a12d2d')
left,right,top,bottom=105,865,130,425
for v in [80,100,120,140]:
 y=bottom-(v-80)/60*(bottom-top);d.line((left,y,right,y),fill='#d8e0dd',width=2);d.text((45,y-12),str(v),font=font(22),fill='#223e44')
d.text((46,100),'Value',font=font(19),fill='#223e44')
values=[100,110,105,120];points=[]
for i,v in enumerate(values):
 x=left+i*(right-left)/3;y=bottom-(v-80)/60*(bottom-top);points.append((x,y));d.text((x-20,bottom+18),f'D{i+1}',font=font(22),fill='#223e44');d.text((x-23,y-42),str(v),font=font(25),fill='#0c6b57')
d.line(points,fill='#0c8068',width=7)
for x,y in points:d.ellipse((x-7,y-7,x+7,y+7),fill='#0c8068')
d.text((40,491),'Synthetic demo only. No investment advice.',font=font(22),fill='#a12d2d')
im.save(root/'clear.jpg',quality=94)
im.resize((20,11)).resize((960,540)).filter(ImageFilter.GaussianBlur(25)).save(root/'blurred.jpg',quality=85)
cases=[
 {'id':'clear','image':'clear.jpg','transcript':'【合成测试讲解，非ASR】这是虚构的DEMOCO，代码DEMO，不是真实股票行情。D1是100，D2为110，D3为105，D4为120。整体上升，中间D2到D3有回落。不提供投资建议。','expected':{'ticker':'DEMO','title':'DEMOCO','values':[100,110,105,120],'trend':'overall up with D2 to D3 dip'}},
 {'id':'conflict','image':'clear.jpg','transcript':'【合成测试讲解，非ASR，故意包含错误】讲者声称这个虚构DEMO图表从D1的100下跌到D4的80，整体是下跌。请核对音画是否冲突，不要据此给投资建议。','expected':{'conflict':'chart is 100 to 120 up; speaker claims 100 to 80 down'}},
 {'id':'blurred','image':'blurred.jpg','transcript':'【合成测试讲解，非ASR】画面上的股票代码和具体数字我没有念出，请不要猜测。','expected':{'readability':'partial or unreadable','ticker':'cannot read','numbers':'cannot read'}}]
(root/'cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2))
print(root)
