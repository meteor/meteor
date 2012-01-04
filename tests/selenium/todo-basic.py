from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import NoSuchElementException


import unittest, time, re

TIMEOUT = 30 # seconds
URL = "http://localhost:3000/"

class bar(unittest.TestCase):
    def setUp(self):
        self.verificationErrors = []
        self.drivers = []

        ##### Native firefox

        self.drivers = [webdriver.Firefox(), webdriver.Firefox()]

        ##### Sauce Labs

        #URL = "http://todos.meteor.com/"
        #WD="http://SAUCE_ID:SAUCE_KEY@ondemand.saucelabs.com:80/wd/hub"

        # desired_capabilities = webdriver.DesiredCapabilities.FIREFOX
        # #desired_capabilities['version'] = '6'
        # desired_capabilities['platform'] = 'XP'
        # desired_capabilities['name'] = 'client 1'

        # self.drivers.append(
        #     webdriver.Remote(
        #         desired_capabilities=desired_capabilities,
        #         command_executor=WD))


        # desired_capabilities = webdriver.DesiredCapabilities.CHROME
        # #desired_capabilities['version'] = '6'
        # desired_capabilities['platform'] = 'VISTA'
        # desired_capabilities['name'] = 'client 2'

        # self.drivers.append(
        #     webdriver.Remote(
        #         desired_capabilities=desired_capabilities,
        #         command_executor=WD))


        ##### Local selenium server

        # self.drivers.append(
        #     webdriver.Remote(
        #         desired_capabilities=webdriver.DesiredCapabilities.FIREFOX))

        # self.drivers.append(
        #     webdriver.Remote(
        #         desired_capabilities=webdriver.DesiredCapabilities.OPERA))



    def tearDown(self):
        for d in self.drivers:
            d.quit()

        self.assertEqual([], self.verificationErrors)


    def switchClient(self):
        self.drivers.reverse() # XXX rotate, so we can have more than 2
        return self.drivers[0]

    def waitFor(self, func):
        for i in range(TIMEOUT):
            try:
                if func(): break
            except: pass
            time.sleep(1)
        else: self.fail("time out")


    def is_element_present(self, driver, how, what):
        try: driver.find_element(by=how, value=what)
        except NoSuchElementException, e: return False
        return True

    ## work arounds for crappy cross browser issues.
    ## jquery is the lowest common denominator.

    def double_click(self, driver, jquery_selector):
        # do the double click by reaching into javascript.
        # this assumes jquery!
        driver.execute_script("$('%s').dblclick();" % (jquery_selector,))

        # Old busted. This breaks stuff.
        #ActionChains(driver).double_click(element).perform()

    def text_enter(self, driver, jquery_selector, text):
        # assumes jquery!
        # XXX unsafe substitution
        driver.execute_script('(function () { var e = $.Event("keypress"); e.keyCode = 13; $("%s").focus().val("%s").trigger(e); })();' % (jquery_selector, text))

        # the real way (busted on Opera and safari)
        #element = driver.find_element(By.ID, element_id)
        #element.send_keys("A new list")
        #element.send_keys(Keys.RETURN)




    ## The actual test
    def test_bar(self):
        for d in self.drivers: d.get(URL)

        # begin. create new item.
        driver = self.switchClient()

        self.waitFor(
            lambda: self.is_element_present(driver, By.ID, "new-todo"))
        self.waitFor(
            lambda: 1 == len(driver.find_elements_by_xpath(
                    "//ul[@id='item-list']/li")))

        self.text_enter(driver, '#new-todo', "A new item")


        # get item, check it.
        driver = self.switchClient()

        self.waitFor(
            lambda: 2 == len(driver.find_elements_by_xpath(
                    "//ul[@id='item-list']/li")))

        element = driver.find_element_by_xpath(
            "//ul[@id='item-list']/li[2]/div[2]/input[@class='check']")
        self.assertFalse(element.is_selected())
        element.click()


        # get item checked, uncheck it
        driver = self.switchClient()

        xpath = "//ul[@id='item-list']/li[2]/div[2]/input[@class='check']"
        self.waitFor(lambda: driver.find_element_by_xpath(xpath)
                     .is_selected())
        driver.find_element_by_xpath(xpath).click()


        # get item unchecked, delete it
        driver = self.switchClient()

        xpath = "//ul[@id='item-list']/li[2]/div[2]/input[@class='check']"
        self.waitFor(lambda: not driver.find_element_by_xpath(xpath)
                     .is_selected())

        driver.find_element_by_xpath("//ul[@id='item-list']/li[2]/div[@class='destroy']").click()


        # see item die, create new list.
        driver = self.switchClient()

        self.waitFor(
            lambda: 1 == len(driver.find_elements_by_xpath(
                    "//ul[@id='item-list']/li")))

        self.text_enter(driver, '#new-list', "A new list")


        # get new list, select it.
        driver = self.switchClient()

        xpath = "//div[@id='lists']/div[1]/div/div"
        self.waitFor(
            lambda: "A new list" == driver.find_element_by_xpath(xpath).text)
        driver.find_element_by_xpath(xpath).click()

        self.waitFor(
            lambda: 0 == len(driver.find_elements_by_xpath(
                    "//ul[@id='item-list']/li")))

        # set tag filter. create new item.
        driver.find_element_by_xpath("//div[@id='tag-filter']/div[2]").click()

        self.text_enter(driver, '#new-todo', "A fun thing")


        # see new item show up tagged
        driver = self.switchClient()

        self.waitFor(
            lambda: "fun" == driver.find_element_by_xpath(
                "//ul[@id='item-list']/li[1]/div[@class='item-tags']/div[@class='tag']/div[@class='name']"
                ).text)
        # remove tag
        driver.find_element_by_xpath(
            "//ul[@id='item-list']/li[1]/div[@class='item-tags']/div[@class='tag']/div[@class='remove']"
            ).click()


        # see that item falls out of filter
        driver = self.switchClient()

        self.waitFor(
            lambda: 0 == len(driver.find_elements_by_xpath(
                    "//ul[@id='item-list']/li")))
        # unfilter and see it come back
        driver.find_element_by_xpath("//div[@id='tag-filter']/div[2]").click()
        self.waitFor(
            lambda: 1 == len(driver.find_elements_by_xpath(
                    "//ul[@id='item-list']/li")))

        # add tag
        driver.find_element_by_xpath("//ul[@id='item-list']/li[1]/div[@class='item-tags']/div[normalize-space(@class)='tag addtag']").click()



        self.text_enter(driver, '#item-list li:first div .edittag input', "new tag")
        # element = driver.find_element_by_xpath("//ul[@id='item-list']/li[1]/div[@class='item-tags']/div[@class='tag edittag']/input")



        # see new tag filter comes up
        driver = self.switchClient()

        self.waitFor(
            lambda: "new tag" == driver.find_element_by_xpath("//div[@id='tag-filter']/div[3]").text)

        # delete item
        driver.find_element_by_xpath("//ul[@id='item-list']/li[1]/div[@class='destroy']").click()


        # see tag filter go away
        driver = self.switchClient()

        self.waitFor(
            lambda: 3 == len(driver.find_elements_by_xpath("//div[@id='tag-filter']/div")))

        # rename list to the end

        self.double_click(driver, '#lists .display:first .list-name')

        element = driver.find_element_by_xpath("//div[@id='lists']/div[1]/div[normalize-space(@class)='edit']/input")
        self.waitFor(lambda: element.is_displayed())

        self.text_enter(driver, '#lists div:first .edit input', "Z new name")


        # see that our selected room moves to the end
        driver = self.switchClient()

        xpath = "//div[@id='lists']/div[4]/div[normalize-space(@class)='display']/div"
        self.waitFor(
            lambda: "Z new name" ==
            driver.find_element_by_xpath(xpath).text)

        xpath = "//div[@id='lists']/div[4]"
        self.waitFor(
            lambda: "list selected" ==
            driver.find_element_by_xpath(xpath).get_attribute("class"))


        # add some items
        self.text_enter(driver, '#new-todo', "one")
        self.text_enter(driver, '#new-todo', "two")
        self.text_enter(driver, '#new-todo', "three")


        # rename one of them
        driver = self.switchClient()

        self.waitFor(
            lambda: 3 == len(driver.find_elements_by_xpath(
                    "//ul[@id='item-list']/li")))

        self.double_click(driver, '#item-list li:eq(1) .display .todo-text')

        element = driver.find_element_by_xpath(
            "//ul[@id='item-list']/li[2]/div[normalize-space(@class)='edit']/input")
        self.waitFor(lambda: element.is_displayed())

        self.text_enter(driver, '#item-list li:eq(1) .edit input', "a hundred and two")


        # see name change
        driver = self.switchClient()

        self.waitFor(
            lambda: "a hundred and two" == driver.find_element_by_xpath("//ul[@id='item-list']/li[2]/div[normalize-space(@class)='display']").text)


        # we're done!


if __name__ == "__main__":
    unittest.main()
